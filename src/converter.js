import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, '..', 'media');

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export const LIMITS = {
  jobs: 4,               // Max movies kept/converted at once
  reencode: 1,           // Max heavy HEVC/AV1 re-encodes at once
  idleCleanupMs: 30 * 60 * 1000 // 30 minutes without viewers
};

// In-memory job state: key -> job
const activeJobs = new Map();
let currentReencodes = 0;

/**
 * Wipes the media folder on server startup as required by the specification.
 */
export function wipeMediaDir() {
  try {
    if (fs.existsSync(MEDIA_DIR)) {
      const items = fs.readdirSync(MEDIA_DIR);
      for (const item of items) {
        fs.rmSync(path.join(MEDIA_DIR, item), { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.error('Error wiping media directory:', err);
  }
}

/**
 * Generates a consistent key for a URL and audio track.
 */
export function getJobKey(url, audioTrack = 0) {
  const hash = crypto.createHash('sha256').update(`${url}#${audioTrack}`).digest('hex').substring(0, 16);
  return `wr_${hash}`;
}

/**
 * Probe media source using ffprobe
 */
export function probeSource(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      url
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error('Cannot read this link as video'));
      }
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const format = data.format || {};

        const videoStream = streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          return reject(new Error('Cannot read this link as video'));
        }

        const audioStreams = streams.filter(s => s.codec_type === 'audio').map((s, idx) => ({
          index: idx,
          streamIndex: s.index,
          codec: s.codec_name,
          language: s.tags?.language || s.tags?.LANGUAGE || `Audio ${idx + 1}`,
          title: s.tags?.title || `${s.codec_name?.toUpperCase()} stereo`
        }));

        const subtitleStreams = streams.filter(s => s.codec_type === 'subtitle').map((s, idx) => ({
          index: idx,
          streamIndex: s.index,
          codec: s.codec_name,
          language: s.tags?.language || s.tags?.LANGUAGE || 'English',
          title: s.tags?.title || `Subtitles ${idx + 1}`
        }));

        const duration = parseFloat(format.duration || videoStream.duration || 0);

        resolve({
          videoCodec: videoStream.codec_name ? videoStream.codec_name.toLowerCase() : '',
          isH264: videoStream.codec_name ? videoStream.codec_name.toLowerCase() === 'h264' : false,
          audioStreams,
          subtitleStreams,
          duration,
          width: videoStream.width,
          height: videoStream.height
        });
      } catch (err) {
        reject(new Error('Cannot read this link as video'));
      }
    });

    proc.on('error', () => {
      reject(new Error('Cannot read this link as video'));
    });
  });
}

/**
 * Checks if a URL is a direct format that browsers can play natively.
 */
export function isDirectBrowserPlayable(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.m3u8');
  } catch {
    return false;
  }
}

/**
 * Prepares video source: converts MKV / non-browser formats to HLS.
 * Shared jobs: Everyone playing the same URL shares one conversion.
 * Tracks progress and emits updates via onProgress callback.
 */
export async function prepareMedia(url, audioTrackIndex = 0, onProgress = null) {
  // If already a direct playable link, return direct
  if (isDirectBrowserPlayable(url)) {
    return {
      type: 'direct',
      src: url,
      direct: true
    };
  }

  const key = getJobKey(url, audioTrackIndex);
  const outDir = path.join(MEDIA_DIR, key);
  const playlistFile = path.join(outDir, 'index.m3u8');
  const vttFile = path.join(outDir, 'subtitles.vtt');

  // If already completed on disk, return existing conversion
  if (fs.existsSync(playlistFile) && fs.statSync(playlistFile).size > 0) {
    const hasSubtitles = fs.existsSync(vttFile);
    touchJob(key);
    return {
      type: 'hls',
      key,
      src: `/media/${key}/index.m3u8`,
      subtitles: hasSubtitles ? `/media/${key}/subtitles.vtt` : null,
      ready: true
    };
  }

  // Check if job is currently in progress
  let existingJob = activeJobs.get(key);
  if (existingJob) {
    touchJob(key);
    if (onProgress) {
      existingJob.listeners.add(onProgress);
    }
    return existingJob.promise;
  }

  // Check active jobs capacity (LIMITS.jobs = 4)
  if (activeJobs.size >= LIMITS.jobs) {
    throw new Error('Server is busy with other movies');
  }

  // Probe media source
  const probeInfo = await probeSource(url);
  const needsReencode = !probeInfo.isH264;

  if (needsReencode && currentReencodes >= LIMITS.reencode) {
    throw new Error('Server is busy converting another movie');
  }

  // Create job output directory
  fs.mkdirSync(outDir, { recursive: true });

  const jobObj = {
    key,
    url,
    audioTrackIndex,
    outDir,
    listeners: new Set(),
    viewers: 1,
    cleanupTimer: null,
    isReencoding: needsReencode
  };

  if (onProgress) {
    jobObj.listeners.add(onProgress);
  }

  if (needsReencode) {
    currentReencodes++;
  }

  const conversionPromise = new Promise((resolve, reject) => {
    // 1. Convert video/audio to HLS
    const ffmpegArgs = [
      '-y',
      '-i', url,
      '-map', '0:v:0'
    ];

    if (probeInfo.isH264) {
      ffmpegArgs.push('-c:v', 'copy');
    } else {
      ffmpegArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    }

    // Audio stream selection (Section 10 B)
    const chosenAudio = probeInfo.audioStreams[audioTrackIndex] || probeInfo.audioStreams[0];
    if (chosenAudio) {
      ffmpegArgs.push('-map', `0:a:${chosenAudio.index}`);
    } else {
      ffmpegArgs.push('-map', '0:a:0?');
    }
    ffmpegArgs.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k');

    // HLS packaging options
    ffmpegArgs.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outDir, 'seg-%04d.ts'),
      path.join(outDir, 'index.m3u8'),
      '-progress', 'pipe:1'
    );

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs);
    let totalDurationUs = (probeInfo.duration || 1) * 1000000;

    ffmpegProc.stdout.on('data', chunk => {
      const text = chunk.toString();
      const match = text.match(/out_time_us=(\d+)/);
      if (match) {
        const outUs = parseInt(match[1], 10);
        let percent = Math.min(99, Math.round((outUs / totalDurationUs) * 100));
        if (isNaN(percent) || percent < 0) percent = 0;
        for (const cb of jobObj.listeners) {
          try { cb({ key, progress: percent, status: 'converting' }); } catch {}
        }
      }
    });

    ffmpegProc.on('close', async code => {
      if (needsReencode) {
        currentReencodes = Math.max(0, currentReencodes - 1);
      }

      if (code !== 0) {
        activeJobs.delete(key);
        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
        return reject(new Error('Cannot read this link as video'));
      }

      // 2. Subtitle extraction (Section 10 A):
      // If subtitle stream exists, extract first English or first subtitle track to WebVTT
      let hasSubtitles = false;
      if (probeInfo.subtitleStreams && probeInfo.subtitleStreams.length > 0) {
        const engSub = probeInfo.subtitleStreams.find(s => s.language.toLowerCase().includes('en')) || probeInfo.subtitleStreams[0];
        try {
          await extractSubtitles(url, engSub.index, vttFile);
          hasSubtitles = fs.existsSync(vttFile);
        } catch (subErr) {
          // Non-fatal if subtitle extraction fails
          console.warn('Subtitle extraction warning:', subErr.message);
        }
      }

      for (const cb of jobObj.listeners) {
        try { cb({ key, progress: 100, status: 'ready' }); } catch {}
      }

      resolve({
        type: 'hls',
        key,
        src: `/media/${key}/index.m3u8`,
        subtitles: hasSubtitles ? `/media/${key}/subtitles.vtt` : null,
        ready: true
      });
    });

    ffmpegProc.on('error', err => {
      if (needsReencode) {
        currentReencodes = Math.max(0, currentReencodes - 1);
      }
      activeJobs.delete(key);
      try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
      reject(new Error('Cannot read this link as video'));
    });
  });

  jobObj.promise = conversionPromise;
  activeJobs.set(key, jobObj);

  return conversionPromise;
}

/**
 * Subtitle extractor (Section 10 Prompt A)
 */
function extractSubtitles(sourceUrl, subIndex, destFile) {
  return new Promise((resolve) => {
    const subProc = spawn('ffmpeg', [
      '-y',
      '-i', sourceUrl,
      '-map', `0:s:${subIndex}`,
      '-f', 'webvtt',
      destFile
    ]);

    subProc.on('close', code => {
      resolve(code === 0);
    });

    subProc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Touch job to reset 30-minute idle cleanup timer.
 */
export function touchJob(key) {
  const job = activeJobs.get(key);
  if (!job) return;
  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer);
    job.cleanupTimer = null;
  }
}

/**
 * Schedule 30-minute cleanup when no viewers are watching.
 */
export function scheduleJobCleanup(key) {
  const job = activeJobs.get(key);
  if (!job) return;
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);

  job.cleanupTimer = setTimeout(() => {
    try {
      const dir = path.join(MEDIA_DIR, key);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      activeJobs.delete(key);
    } catch (e) {
      console.error(`Failed to clean up media ${key}:`, e);
    }
  }, LIMITS.idleCleanupMs);
}
