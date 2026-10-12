# Media Conversion Pipeline

WatchRoom v2 bridges the gap between browser format constraints and modern video formats (MKV, AVI, MOV, TS).

---

## 1. Why Conversion is Necessary

Browsers do not support Matroska (`.mkv`) containers reliably:
- Firefox supports MKV only with VP9 video; H.264 inside MKV fails to play.
- Chrome and Safari exhibit inconsistent platform support and lack native decoders for audio codecs commonly bundled in MKV files (such as AC3, E-AC3, DTS, and 5.1/7.1 multichannel PCM).

**Solution**: WatchRoom modifies the container without re-compressing the video stream whenever possible. It outputs standard HLS (HTTP Live Streaming), creating an `.m3u8` playlist with `.ts` segments containing H.264 video and stereo AAC audio.

---

## 2. Pipeline Workflow

```
Video URL
   │
   ▼
1. Direct check: .mp4, .webm, .m3u8?
   │
   ├─► YES ──► Return direct link (No conversion needed)
   │
   └─► NO (MKV, AVI, MOV, TS)
        │
        ▼
2. ffprobe: Read streams & duration
        │
        ├─► Video codec == 'h264'?
        │     ├─► YES ──► Copy video (-c:v copy) [Minimal CPU]
        │     └─► NO  ──► Re-encode (-c:v libx264 -preset veryfast) [Heavy CPU]
        │
        ├─► Audio streams: Convert selected track to AAC stereo (-c:a aac -ac 2)
        │
        ├─► Subtitle streams present?
        │     └─► Extract first English track to WebVTT (.vtt)
        │
        ▼
3. Write HLS segments (.ts) + index.m3u8 into /media/<key>/
        │
        ▼
4. Browser plays /media/<key>/index.m3u8 via hls.js
```

---

## 3. Concurrency Limits & Throttling

To prevent resource exhaustion, the server enforces strict limits:

| Setting | Value | Description |
|---|---|---|
| `LIMITS.jobs` | `4` | Maximum number of concurrent active conversion jobs kept simultaneously. |
| `LIMITS.reencode` | `1` | Maximum concurrent heavy re-encodes (HEVC/AV1 $\to$ H.264). Prevents CPU starvation. |
| `LIMITS.idleCleanupMs` | `30 mins` | Automatically removes converted media files from disk after 30 minutes without active viewers. |

### Shared Jobs
If multiple rooms or users play the exact same video URL, they share a single active conversion Promise. Duplicate transcoding runs are never triggered.

---

## 4. Subtitles & Audio Track Selection

### Subtitles (WebVTT)
If embedded subtitle streams are detected in the container, the converter extracts the first English (or first available) stream into a WebVTT file:
```bash
ffmpeg -y -i <url> -map 0:s:0 -f webvtt /media/<key>/subtitles.vtt
```
The client attaches this WebVTT file dynamically as a `<track kind="subtitles">` element.

### Audio Track Mapping
The audio stream index is selectable (`audioTrackIndex`), passed to ffmpeg via `-map 0:a:<index>` and transcoded to stereo AAC:
```bash
ffmpeg -i <url> -map 0:v:0 -map 0:a:<index> -c:a aac -ac 2 -b:a 192k ...
```
Jobs are keyed by `url + audioTrackIndex` so alternate language tracks do not conflict.
