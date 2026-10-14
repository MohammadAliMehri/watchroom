import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchroom-converter-test-'));
process.env.MEDIA_DIR = path.join(tmpDir, 'media');

const { prepareMedia, getJobKey, MEDIA_DIR } = await import('../src/converter.js');

function ffmpeg(args) {
    const res = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
}

const SRT = `1
00:00:00,500 --> 00:00:01,500
first

2
00:00:04,000 --> 00:00:05,000
second

3
00:00:08,000 --> 00:00:09,000
third
`;

function makeMkv(file, { withSubtitles }) {
    const srt = path.join(tmpDir, 'subs.srt');
    fs.writeFileSync(srt, SRT);
    const inputs = [
        '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=10',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    ];
    const maps = ['-map', '0:v:0', '-map', '1:a:0'];
    const codecs = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
    if (withSubtitles) {
        inputs.push('-i', srt);
        maps.push('-map', '2:s:0');
        codecs.push('-c:s', 'srt');
    }
    ffmpeg([...inputs, '-t', '10', ...maps, ...codecs, file]);
}

test('Converter: embedded text subtitles are fully converted to WebVTT alongside HLS', async () => {
    const mkv = path.join(tmpDir, 'with-subs.mkv');
    makeMkv(mkv, { withSubtitles: true });

    const result = await prepareMedia(mkv);
    assert.equal(result.type, 'hls');
    assert.ok(result.subtitles, 'subtitle URL must be returned');

    const vtt = fs.readFileSync(path.join(MEDIA_DIR, getJobKey(mkv, 0), 'subtitles.vtt'), 'utf8');
    assert.match(vtt, /^WEBVTT/);
    assert.equal((vtt.match(/-->/g) || []).length, 3);
    assert.ok(vtt.includes('third'), 'last cue must not be truncated');
});

test('Converter: sources without subtitle tracks return no subtitle URL', async () => {
    const mkv = path.join(tmpDir, 'no-subs.mkv');
    makeMkv(mkv, { withSubtitles: false });

    const result = await prepareMedia(mkv);
    assert.equal(result.type, 'hls');
    assert.equal(result.subtitles, null);
});

test.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
