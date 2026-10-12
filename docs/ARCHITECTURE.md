# WatchRoom v2 Architecture

WatchRoom is a synchronized video watching application designed to stream arbitrary video formats (MKV, AVI, MOV, TS, MP4, WebM) across multiple viewers in real-time.

```
                      ┌────────────────────────────────────────┐
                      │             Web Browser(s)             │
                      │  (React 19 + Tailwind + Hls.js Player) │
                      └──────────────────┬─────────────────────┘
                                         │ WebSocket / HTTP
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             WatchRoom Server                                │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │     Express App      │  │   Socket.IO Server   │  │   SQLite (DB)     │  │
│  │  - Static delivery   │  │  - Room clock sync   │  │  - Rooms          │  │
│  │  - REST API          │  │  - Presence & Chat   │  │  - Playlists      │  │
│  │  - /healthz          │  │  - Control events    │  │  - 100 Messages   │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └───────────────────┘  │
│             │                         │                                     │
│             ▼                         ▼                                     │
│  ┌────────────────────────────────────────────────┐                         │
│  │         Security Layer 1 (SSRF Filter)         │                         │
│  │  - Protocol check (http/https only)            │                         │
│  │  - DNS resolution & forbidden IP blacklist     │                         │
│  └────────────────────────┬───────────────────────┘                         │
│                           │                                                 │
│                           ▼                                                 │
│  ┌────────────────────────────────────────────────┐                         │
│  │           Media Conversion Engine              │                         │
│  │  - ffprobe analysis (video/audio/subtitles)    │                         │
│  │  - Smart video copy (-c:v copy if H.264)       │                         │
│  │  - Re-encode throttle (max 1 concurrent)       │                         │
│  │  - AAC stereo transcoding                      │                         │
│  │  - WebVTT subtitle extraction                  │                         │
│  │  - HLS segmenter (.m3u8 + .ts in /media)       │                         │
│  └────────────────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Security Layer 2 (watchroom-egress.service)                 │
│  - Linux iptables firewall rules for 'watchroom' user UID                   │
│  - Blocks 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, carrier NAT, IPv6 │
│  - Protects against DNS rebinding & internal network access                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Core Modules

### 1.1 `server.js`
Entrypoint combining Express and Socket.IO. Handles HTTP routing, health checks, static file serving (`/` and `/public`), HLS stream delivery (`/media`), and registers real-time event listeners.

### 1.2 `src/security.js`
Application-layer SSRF defense. Resolves hostnames to all IPv4 and IPv6 addresses and verifies them against private, loopback, link-local, carrier-grade NAT, and cloud metadata ranges before any external connection is initiated.

### 1.3 `src/converter.js`
The video conversion pipeline:
- Probes media stream codecs via `ffprobe`.
- Direct pass-through for natively supported container formats (`.mp4`, `.webm`, `.m3u8`).
- Smart HLS segmenting: Copies H.264 video streams directly; transcodes non-H.264 video (HEVC, AV1) using `libx264`.
- Transcodes all audio streams to standard stereo AAC.
- Extracts embedded subtitle streams into standalone WebVTT (`.vtt`) files.
- Deduplicates jobs: Multiple viewers requesting the same URL share a single ongoing conversion process.
- Automatic 30-minute cleanup timer when no viewers remain.

### 1.4 `src/roomManager.js`
Coordinates live rooms, state broadcasting, member presence, and synchronizes the playback clock. Maintains an in-memory view of active rooms synchronized with the database.

### 1.5 `src/db.js`
Lightweight persistent storage using Node 24's native `node:sqlite` (`DatabaseSync`). Persists room metadata, playlist items, and chat history across restarts.

---

## 2. Synchronization Model

Sync is the primary promise of WatchRoom. Playback stays in sync using the following model:

1. **Server Clock Authority**:
   - The server maintains `currentTime`, `isPlaying`, and `updatedAt`.
   - When a video is playing, current room position equals:
     $$\text{effectiveTime} = \text{currentTime} + \frac{\text{Date.now}() - \text{updatedAt}}{1000}$$
2. **Client Drift Correction**:
   - The browser compares local `<video>.currentTime` against the calculated server position.
   - If $|\text{localTime} - \text{serverTime}| \le 1.5\text{s}$, the player remains undisturbed and shows **"In sync"** (green dot).
   - If drift exceeds $1.5\text{s}$, the player smoothly adjusts video position and indicates **"Catching up…"** (amber dot).
3. **Action Broadcasts**:
   - User actions (`play`, `pause`, `seek`, `changeItem`) emit `sync:control` events to the server.
   - The server updates state, emits `sync:state`, and inserts a grey action note into the chat log (e.g., *"Mia paused at 21:04"*).
