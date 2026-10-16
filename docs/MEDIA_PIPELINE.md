# Media pipeline

## Supported inputs and fetch paths

| Input                                             | Fetches the source                    | Playback                               |
| ------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| URL pathname ending in `.mp4`, `.webm` or `.m3u8` | Each viewer's browser                 | Direct/native video or HLS.js          |
| MKV, AVI, MOV, TS and other non-direct URL paths  | FFprobe and FFmpeg on the server      | Converted HLS from WatchRoom           |
| Local filesystem fixture                          | Converter tests/internal library only | Not accepted through the room URL form |

Extensions are a routing heuristic, not proof that a codec is browser-compatible. A signed URL with no recognized extension goes through conversion. A direct media URL must return video or an HLS playlist, not a web page, login form or DRM player. Protected media hosts that depend on browser cookies are not supported by the server conversion path.

For direct playback, the media host must be reachable by **every viewer**, use HTTPS when WatchRoom uses HTTPS, and provide CORS where the playback path requires it. For converted playback, the WatchRoom server needs working native DNS and outbound access to the source and its redirects.

## Preparation sequence

1. The room validates the URL scheme and all resolved IP addresses. Server-side HTTP(S) probing/conversion also requires an actual OS egress policy and its startup assertion.
2. Direct formats return their source URL immediately, without launching FFmpeg. Adding a queue entry does not wait for FFprobe; duration may remain `0` (unknown).
3. For conversion, FFprobe discovers the first video stream, audio ordinals, text subtitle streams, languages, titles and duration.
4. H.264 video is copied with `-c:v copy`. Other video codecs use `libx264 -preset ultrafast -tune zerolatency -crf 23`.
5. The chosen audio stream is converted to stereo AAC (`-c:a aac -ac 2 -b:a 192k`). Sources without audio can still convert.
6. FFmpeg writes an HLS event playlist and approximately four-second MPEG-TS segments using atomic temporary files. As soon as the playlist references a complete segment, WatchRoom publishes the stream so playback can begin while conversion continues.
7. After successful FFmpeg exit, WatchRoom atomically writes `metadata.json` as a completion marker, publishes embedded subtitle tracks and sends the final room state. Subtitle tracks appear after the full conversion finishes.

**Playback starts after the first complete HLS segment is published.** Large downloads, HEVC/AV1 encoding and subtitle extraction continue in the background; the player shows conversion progress while new segments arrive. Preparation progress is an estimate from media timestamps, not a download speed or readiness guarantee. If conversion fails after playback starts, WatchRoom stops the partial stream and reports the error. When changing audio, the room pauses during preparation and resumes from its frozen position after the new stream is playable. Selecting another episode cancels the old result's ability to update the room, although its shared conversion may continue and be cached.

## Subtitles

The converter extracts all recognized text subtitle streams: SubRip/SRT, ASS/SSA, `mov_text`, WebVTT and text. ASS styling is reduced to WebVTT text cues. PGS, DVD and other bitmap subtitles are not converted or burned into the video; use an external SRT/VTT instead.

A preferred English (`en`/`eng`) text stream is the default when available; otherwise the first text stream is selected. Missing language tags use `und`, rather than assuming English. The compatibility `subtitles.vtt` contains the default track; each selectable stream also has `sub_<ordinal>.vtt`.

Actual track objects use `src`, not `url`:

```json
{
  "id": "sub_1",
  "streamIndex": 3,
  "language": "fas",
  "label": "فارسی",
  "src": "/media/wr_example/sub_1.vtt",
  "default": false
}
```

The browser's CC menu selects tracks, toggles captions, adjusts size and shifts cue timing. A positive offset displays cues later, a negative offset earlier; Reset restores the original times. Changes are local to each viewer. Local SRT/VTT uploads are read in that browser, converted to a blob URL where needed, and never uploaded or shared with other viewers.

## Audio selection

Audio ordinals are relative to audio streams, starting at `0`; they are not FFprobe's absolute stream indexes. A selected ordinal is mapped with `-map 0:a:<ordinal>`. The default is the first audio stream. Track changes use `media:prepare` for the current playlist URL; in a host-only room only the owner can make that change. Alternate audio selections create separate shared jobs.

## Cache, limits and failure behavior

The key is `wr_` plus the first 16 hexadecimal characters of SHA-256 over `URL#audioOrdinal`. Query strings are part of the key; renewed signed URLs produce a different job. Each completed directory contains:

```text
media/wr_<hash>/
  index.m3u8
  seg-0000.ts
  seg-0001.ts
  subtitles.vtt      # only when a default text track exists
  sub_0.vtt         # individual text tracks, when available
  metadata.json     # completion marker and audio/subtitle metadata
```

A playlist file alone is not a completed cache entry: in-progress playback is published only when the playlist references an atomically written segment, and `metadata.json` is written only after FFmpeg exits successfully. Concurrent requests share the pending promise, and cache reuse preserves audio streams and subtitle language labels. Failures remove partial output and release the heavy-encode slot. Late room results/progress are ignored after a newer selection or room deletion.

| Limit                          | Value                                |
| ------------------------------ | ------------------------------------ |
| Cached/active job slots        | 4                                    |
| Concurrent heavy video encodes | 1                                    |
| Idle cleanup                   | 30 minutes after the movie is unused |
| FFprobe timeout                | 60 seconds                           |
| FFprobe output cap             | 8 MiB                                |
| Conversion timeout             | 6 hours                              |

A still-viewed movie is retained if another room becomes empty. Rejoining cancels idle cleanup. Pending conversion cleanup begins after completion, rather than deleting files while FFmpeg is writing them. The entire disposable cache is cleared at app startup.

FFmpeg uses reconnect options for remote input and `Accept-Encoding: identity`. Those options help with interrupted connections; they cannot guarantee that an expired, throttled or authenticated source will work. Expected errors include unsupported/unreadable links, blocked addresses, busy job/encode limits and probe/conversion timeouts.

See the [watching guide](USAGE.md) for user steps and [deployment troubleshooting](DEPLOYMENT.md#troubleshooting) for host checks.
