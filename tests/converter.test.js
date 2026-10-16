import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "watchroom-converter-test-"),
);
process.env.MEDIA_DIR = path.join(tmpDir, "media");

const { prepareMedia, getJobKey, MEDIA_DIR } =
  await import("../src/converter.js");

function ffmpeg(args) {
  const res = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], {
    encoding: "utf8",
  });
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
  const srt = path.join(tmpDir, "subs.srt");
  fs.writeFileSync(srt, SRT);
  const inputs = [
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=160x90:r=10:d=10",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
  ];
  const maps = ["-map", "0:v:0", "-map", "1:a:0"];
  const codecs = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"];
  if (withSubtitles) {
    inputs.push("-i", srt);
    maps.push("-map", "2:s:0");
    codecs.push("-c:s", "srt");
  }
  ffmpeg([...inputs, "-t", "10", ...maps, ...codecs, file]);
}

test("Converter: embedded text subtitles are fully converted to WebVTT alongside HLS", async () => {
  const mkv = path.join(tmpDir, "with-subs.mkv");
  makeMkv(mkv, { withSubtitles: true });

  const result = await prepareMedia(mkv);
  assert.equal(result.type, "hls");
  assert.ok(result.subtitles, "subtitle URL must be returned");

  const vtt = fs.readFileSync(
    path.join(MEDIA_DIR, getJobKey(mkv, 0), "subtitles.vtt"),
    "utf8",
  );
  assert.match(vtt, /^WEBVTT/);
  assert.equal((vtt.match(/-->/g) || []).length, 3);
  assert.ok(vtt.includes("third"), "last cue must not be truncated");
});

test("Converter: sources without subtitle tracks return no subtitle URL", async () => {
  const mkv = path.join(tmpDir, "no-subs.mkv");
  makeMkv(mkv, { withSubtitles: false });

  const result = await prepareMedia(mkv);
  assert.equal(result.type, "hls");
  assert.equal(result.subtitles, null);
});

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Converter: multilingual embedded subtitles and audio metadata survive cache reuse", async () => {
  const mkv = path.join(tmpDir, "multilingual.mkv");
  const first = path.join(tmpDir, "english.srt");
  const second = path.join(tmpDir, "persian.srt");
  fs.writeFileSync(first, SRT);
  fs.writeFileSync(
    second,
    SRT.replace("first", "سلام").replace("third", "پایان"),
  );
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=160x90:r=10:d=10",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-i",
    first,
    "-i",
    second,
    "-t",
    "10",
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-map",
    "2:s",
    "-map",
    "3:s",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-c:s",
    "srt",
    "-metadata:s:s:0",
    "language=eng",
    "-metadata:s:s:0",
    "title=English",
    "-metadata:s:s:1",
    "language=fas",
    "-metadata:s:s:1",
    "title=فارسی",
    mkv,
  ]);
  const [result, concurrent] = await Promise.all([
    prepareMedia(mkv),
    prepareMedia(mkv),
  ]);
  assert.deepEqual(concurrent, result);
  assert.equal(result.subtitleTracks.length, 2);
  assert.equal(result.subtitleTracks[0].language, "eng");
  assert.equal(result.subtitleTracks[1].label, "فارسی");
  assert.equal(result.subtitleTracks.filter((t) => t.default).length, 1);
  const vtt = fs.readFileSync(
    path.join(MEDIA_DIR, getJobKey(mkv), "sub_1.vtt"),
    "utf8",
  );
  assert.match(vtt, /سلام/);
  assert.match(vtt, /پایان/);
  // A fresh module has no in-memory jobs: exercises the disk completion marker.
  const coldConverter = await import(`../src/converter.js?cold=${Date.now()}`);
  const cached = await coldConverter.prepareMedia(mkv);
  assert.deepEqual(cached, result);
  assert.equal(cached.audioStreams.length, 1);
});

test("Converter: cleanup waits for an in-progress conversion to finish", async (t) => {
  const { scheduleJobCleanup, LIMITS } = await import("../src/converter.js");
  const mkv = path.join(tmpDir, "pending-cleanup.mkv");
  makeMkv(mkv, { withSubtitles: false });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = prepareMedia(mkv);
  const key = getJobKey(mkv);
  scheduleJobCleanup(key);
  await pending;
  // Let the cleanup continuation attach its idle timer after conversion resolves.
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(fs.existsSync(path.join(MEDIA_DIR, key, "metadata.json")));
  t.mock.timers.tick(LIMITS.idleCleanupMs);
  assert.equal(fs.existsSync(path.join(MEDIA_DIR, key)), false);
});

test("Converter: another live room and rejoining viewers protect a shared movie from cleanup", async (t) => {
  const { RoomManager } = await import("../src/roomManager.js");
  const { touchJob, LIMITS } = await import("../src/converter.js");
  const key = getJobKey(path.join(tmpDir, "with-subs.mkv"));
  const directory = path.join(MEDIA_DIR, key);
  assert.ok(fs.existsSync(directory));
  const manager = Object.create(RoomManager.prototype);
  const first = { members: new Map(), playback: { mediaKey: key } };
  const second = {
    members: new Map([["viewer", {}]]),
    playback: { mediaKey: key },
  };
  manager.rooms = new Map([
    ["first", first],
    ["second", second],
  ]);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  manager.scheduleUnusedMedia(key);
  t.mock.timers.tick(LIMITS.idleCleanupMs);
  assert.ok(fs.existsSync(directory), "another room is still watching");
  second.members.clear();
  manager.scheduleUnusedMedia(key);
  first.members.set("returning-viewer", {});
  touchJob(key);
  t.mock.timers.tick(LIMITS.idleCleanupMs);
  assert.ok(
    fs.existsSync(directory),
    "a returning viewer cancels idle cleanup",
  );
  first.members.clear();
  manager.scheduleUnusedMedia(key);
  t.mock.timers.tick(LIMITS.idleCleanupMs);
  assert.equal(fs.existsSync(directory), false);
});
