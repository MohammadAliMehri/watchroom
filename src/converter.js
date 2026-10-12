import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMediaEgressProtection } from './security.js';

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
  idleCleanupMs: 30 * 60 * 1000, // 30 minutes without viewers
  probeTimeoutMs: 60 * 1000,
  conversionTimeoutMs: 6 * 60 * 60 * 1000,
  maxProbeOutputBytes: 8 * 1024 * 1024
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

function getInputProtocolWhitelist(url) {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'http:' || protocol === 'https:') return 'http,https,tcp,tls,crypto';
  } catch { }
  return 'file,pipe';
}

/**
 * Probe media source using ffprobe
 */
export function probeSource(url) {
  try {
    assertMediaEgressProtection(url);
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-protocol_whitelist', getInputProtocolWhitelist(url),
      url
    ]);

    let stdout = '';
    let stdoutBytes = 0;
    let timedOut = false;
    let outputTooLarge = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, LIMITS.probeTimeoutMs);

    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    proc.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > LIMITS.maxProbeOutputBytes) {
        outputTooLarge = true;
        proc.kill();
      } else {
        stdout += chunk;
      }
    });
    proc.stderr.on('data', () => { });

    proc.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (timedOut) return reject(new Error('Media probe timed out'));
      if (outputTooLarge) return reject(new Error('Media probe output exceeded the limit'));
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

    proc.on('error', () => fail(new Error('Cannot read this link as video')));
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

function releaseReencode(job) {
  if (!job.isReencoding) return;
  currentReencodes = Math.max(0, currentReencodes - 1);
  job.isReencoding = false;
}

function convertToHls(job, probeInfo, audioTrackIndex) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-y',
      '-protocol_whitelist', getInputProtocolWhitelist(job.url),
      '-i', job.url,
      '-map', '0:v:0'
    ];
    if (probeInfo.isH264) {
      ffmpegArgs.push('-c:v', 'copy');
    } else {
      ffmpegArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    }

    const chosenAudio = probeInfo.audioStreams[audioTrackIndex] || probeInfo.audioStreams[0];
    ffmpegArgs.push('-map', chosenAudio ? `0:a:${chosenAudio.index}` : '0:a:0?');
    ffmpegArgs.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k');
    ffmpegArgs.push(
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(job.outDir, 'seg-%04d.ts'),
      '-progress', 'pipe:1',
      path.join(job.outDir, 'index.m3u8')
    );

    const proc = spawn('ffmpeg', ffmpegArgs);
    const durationUs = (probeInfo.duration || 1) * 1000000;
    let progressBuffer = '';
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, LIMITS.conversionTimeoutMs);

    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };

    proc.stdout.on('data', chunk => {
      progressBuffer = (progressBuffer + chunk.toString()).slice(-65536);
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)$/);
        if (!match) continue;
        const progress = Math.max(0, Math.min(99, Math.round((Number(match[1]) / durationUs) * 100)));
        for (const listener of job.listeners) {
          try { listener({ key: job.key, progress, status: 'converting' }); } catch { }
        }
      }
    });
    proc.stderr.on('data', () => { });
    proc.once('error', () => finish(new Error('Cannot read this link as video')));
    proc.once('close', code => {
      if (timedOut) return finish(new Error('Media conversion timed out'));
      if (code !== 0) return finish(new Error('Cannot read this link as video'));
      finish();
    });
  });
}

/**
 * Prepares video source: converts unsupported formats to HLS and shares concurrent jobs.
 */
export async function prepareMedia(url, audioTrackIndex = 0, onProgress = null) {
  if (isDirectBrowserPlayable(url)) {
    return { type: 'direct', src: url, direct: true };
  }

  const key = getJobKey(url, audioTrackIndex);
  const outDir = path.join(MEDIA_DIR, key);
  const playlistFile = path.join(outDir, 'index.m3u8');
  const vttFile = path.join(outDir, 'subtitles.vtt');

  if (fs.existsSync(playlistFile) && fs.statSync(playlistFile).size > 0) {
    const hasSubtitles = fs.existsSync(vttFile);
    touchJob(key);
    return {
      type: 'hls', key, src: `/media/${key}/index.m3u8`,
      subtitles: hasSubtitles ? `/media/${key}/subtitles.vtt` : null,
      ready: true
    };
  }

  const existingJob = activeJobs.get(key);
  if (existingJob) {
    if (onProgress) existingJob.listeners.add(onProgress);
    touchJob(key);
    return existingJob.promise;
  }

  if (activeJobs.size >= LIMITS.jobs) {
    throw new Error('Server is busy with other movies');
  }

  const job = {
    key,
    url,
    outDir,
    listeners: new Set(onProgress ? [onProgress] : []),
    cleanupTimer: null,
    isReencoding: false,
    promise: null
  };
  activeJobs.set(key, job);

  job.promise = Promise.resolve().then(async () => {
    const probeInfo = await probeSource(url);
    if (!probeInfo.isH264) {
      if (currentReencodes >= LIMITS.reencode) {
        throw new Error('Server is busy converting another movie');
      }
      currentReencodes++;
      job.isReencoding = true;
    }

    fs.mkdirSync(outDir, { recursive: true });
    await convertToHls(job, probeInfo, audioTrackIndex);
    releaseReencode(job);

    let hasSubtitles = false;
    if (probeInfo.subtitleStreams.length > 0) {
      const englishSubtitle = probeInfo.subtitleStreams.find(stream =>
        stream.language.toLowerCase().includes('en')) || probeInfo.subtitleStreams[0];
      hasSubtitles = await extractSubtitles(url, englishSubtitle.index, vttFile) && fs.existsSync(vttFile);
    }

    for (const listener of job.listeners) {
      try { listener({ key, progress: 100, status: 'ready' }); } catch { }
    }

    return {
      type: 'hls', key, src: `/media/${key}/index.m3u8`,
      subtitles: hasSubtitles ? `/media/${key}/subtitles.vtt` : null,
      ready: true
    };
  }).catch(error => {
    releaseReencode(job);
    if (activeJobs.get(key) === job) activeJobs.delete(key);
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { }
    throw error;
  });

  return job.promise;
}

/**
 * Subtitle extractor (Section 10 Prompt A)
 */
function extractSubtitles(sourceUrl, subIndex, destFile) {
  return new Promise((resolve) => {
    const subProc = spawn('ffmpeg', [
      '-y',
      '-protocol_whitelist', getInputProtocolWhitelist(sourceUrl),
      '-i', sourceUrl,
      '-map', `0:s:${subIndex}`,
      '-f', 'webvtt',
      destFile
    ]);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      subProc.kill();
    }, LIMITS.probeTimeoutMs);

    subProc.on('close', code => {
      clearTimeout(timeout);
      resolve(code === 0 && !timedOut);
    });

    subProc.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    subProc.stdout.on('data', () => { });
    subProc.stderr.on('data', () => { });
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
  job.cleanupTimer.unref?.();
}
