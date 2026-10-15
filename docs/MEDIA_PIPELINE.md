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
        │     └─► NO  ──► Transcode (-c:v libx264 -preset ultrafast -tune zerolatency -crf 23)
        │
        ├─► Audio streams: Convert selected track to AAC stereo (-c:a aac -ac 2)
        │
        ├─► Subtitle streams present?
        │     └─► Extract ALL embedded text tracks to WebVTT (sub_${index}.vtt + subtitles.vtt)
        │
        ▼
3. Write HLS segments (.ts) + index.m3u8 into /media/<key>/
        │
        ▼
4. Browser plays /media/<key>/index.m3u8 via hls.js with native WebVTT subtitle tracks
```

---

## 3. Online Stream Reconnection & CDN Resilience

Remote MKV/video URLs hosted on file lockers, cloud providers, and direct links often throttle or drop idle TCP connections. To guarantee reliable playback, FFmpeg and FFprobe are configured with resilient stream reconnection flags and browser headers:

```bash
-reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
-user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" \
-headers "Accept-Encoding: identity\r\n"
```

These parameters allow the converter to survive momentary connection resets or HTTP chunks ending early without crashing the HLS stream generator.

---

## 4. Concurrency Limits & Throttling

To prevent resource exhaustion, the server enforces strict limits:

| Setting | Value | Description |
|---|---|---|
| `LIMITS.jobs` | `4` | Maximum number of concurrent active conversion jobs kept simultaneously. |
| `LIMITS.reencode` | `1` | Maximum concurrent heavy re-encodes (HEVC/AV1 $\to$ H.264). Prevents CPU starvation. |
| `LIMITS.idleCleanupMs` | `30 mins` | Automatically removes converted media files from disk after 30 minutes without active viewers. |

### Shared Jobs
If multiple rooms or users play the exact same video URL, they share a single active conversion Promise. Duplicate transcoding runs are never triggered.

---

## 5. Subtitles & Audio Track Engine

### Multi-Track Subtitles (WebVTT)
All embedded subtitle streams (SRT, ASS, SSA, UTF-8) are detected via `ffprobe` and extracted simultaneously:
```bash
ffmpeg -y -i <url> -map 0:s:<index> -c:s webvtt /media/<key>/sub_${index}.vtt
```
The server returns an array of `subtitleTracks`:
```json
[
  { "id": "0", "label": "English (sub_0)", "language": "eng", "url": "/media/<key>/sub_0.vtt" },
  { "id": "1", "label": "Spanish (sub_1)", "language": "spa", "url": "/media/<key>/sub_1.vtt" }
]
```

### Subtitle Client Options
The redesigned video player includes rich subtitle customization controls:
- **Track Switcher**: Seamlessly switch between any embedded subtitle track or disable captions.
- **Timing Offset Adjustment**: Live slider to advance or delay subtitles from `-5.0s` to `+5.0s`.
- **Typography Sizing**: Adjust font size between Small, Medium, Large, and Extra Large.
- **Custom File Upload**: Load local `.srt` or `.vtt` files directly from the user's computer.

### Audio Track Mapping
The audio stream index is selectable (`audioTrackIndex`), passed to ffmpeg via `-map 0:a:<index>` and transcoded to stereo AAC:
```bash
ffmpeg -i <url> -map 0:v:0 -map 0:a:<index> -c:a aac -ac 2 -b:a 192k ...
```
Jobs are keyed by `url + audioTrackIndex` so alternate language tracks do not conflict.
