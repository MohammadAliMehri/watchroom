<div align="center">

# 🎬 WatchRoom v2
### *Synchronized Video Streaming with On-The-Fly MKV to HLS Conversion*

[![Node.js](https://img.shields.io/badge/Node.js-22.13%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-9.0-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)

Watch together in perfect synchronization. WatchRoom v2 adds native support for MKV and other non-browser formats by combining server-side HLS conversion with a dark-first synchronized web player.

[Key Features](#-key-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Security Model](#-two-layer-security-model) • [Documentation](#-documentation)

---

</div>

## ✨ Key Features

- **Any Video Format Supported**:
  - Direct streaming for `.mp4`, `.webm`, and `.m3u8` directly from source.
  - Automatic server-side HLS transcoding for **MKV**, **AVI**, **MOV**, **TS**, and multi-codec containers.
- **Smart Copy Engine**:
  - If the source is already H.264, video packets are stream-copied (`-c:v copy`) without re-encoding, consuming minimal CPU and completing at network transfer speed.
  - Audio is converted on the fly to standard stereo AAC (`-c:a aac -ac 2`) to ensure compatibility with AC3, DTS, and multichannel surround formats.
- **Subtitles & Multi-Audio**:
  - Embedded subtitle tracks are extracted automatically to WebVTT (`.vtt`) and mounted as native video tracks.
  - Multi-audio stream detection and track selection.
- **Two-Layer SSRF & DNS Rebinding Protection**:
  - **Layer 1 (Application)**: Rejects private, loopback, link-local, carrier NAT, and cloud metadata addresses.
  - **Layer 2 (Kernel Firewall)**: Linux `iptables` egress guard blocks internal subnets for the service UID while preserving DNS resolution; production conversion fails closed unless this guard is enabled.
- **Synchronized Playback Engine**:
  - Real-time room clock with sub-second drift detection.
  - Visual **Sync Pill**: Displays *"In sync"* (green dot) when within 1.5s, or *"Catching up…"* (amber dot) during correction.
  - Host-Only Control mode to prevent accidental pauses or seeks by guests.
- **Real-Time Collaboration**:
  - Lightweight room chat with system action notes (*"Mia paused at 21:04"*).
  - Active viewer presence avatars with overflow tags.
  - SQLite persistence (`node:sqlite`) for rooms, playlists, and message history across restarts.
- **Polished Dark-First UI**:
  - Built with React 19, Tailwind CSS v4, Lucide Icons, and HLS.js.
  - 16:9 responsive video container, keyboard shortcuts, touch gestures, and dynamic CSS gradient posters.

---

## 🏛 Architecture

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

## 🚀 Quick Start

### Prerequisites
- **Node.js 22.13+** (Node.js 24 LTS recommended)
- **FFmpeg & FFprobe** installed and accessible in system `PATH`

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/MohammadAliMehri/watchroom.git
cd watchroom

# Install server dependencies
npm install

# Install web client dependencies
npm install --prefix web
```

### 2. Build Web Frontend
```bash
npm run build:web
```

### 3. Run Application
```bash
npm start
```
The server will start on [http://localhost:3000](http://localhost:3000).

For local testing of server-side conversion from remote URLs, explicitly opt in with `ALLOW_UNSAFE_MEDIA_FETCHES=true` (PowerShell: `$env:ALLOW_UNSAFE_MEDIA_FETCHES="true"`). This disables the production egress requirement and must not be used on a server exposed to untrusted users. The Linux installer configures the protected production path.

### 4. Run Test Suite
```bash
npm test
```
Executes automated tests validating SSRF policy, SQLite persistence and password migration, room authorization, and FFmpeg MKV-to-HLS conversion. The test suite generates its media fixture in a temporary directory.

---

## 🔒 Two-Layer Security Model

| Layer | Implementation | Defense Scope |
|---|---|---|
| **Layer 1: Application** | `src/security.js` | Enforces `http`/`https` protocols and resolves hostnames via DNS to disallow private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `100.64.0.0/10`). |
| **Layer 2: Firewall** | `scripts/watchroom-egress.sh` | Linux `iptables` user-scoped egress filter blocking private subnets and cloud metadata IP (`169.254.169.254`), neutralizing DNS rebinding attacks while permitting DNS resolver `127.0.0.53`. |

---

## ⌨️ Desktop Keyboard Shortcuts & Gestures

| Key | Action |
|---|---|
| <kbd>Space</kbd> or <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek backward / forward 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume up / down |
| <kbd>M</kbd> | Mute / Unmute |
| <kbd>F</kbd> | Fullscreen toggle |
| <kbd>N</kbd> | Next playlist item |
| <kbd>/</kbd> | Focus movie link input field |
| <kbd>Enter</kbd> (in chat) | Send message |
| <kbd>Esc</kbd> | Close dialog or exit fullscreen |

**Touch Gestures**:
- Tap video to show / hide playback controls.
- Double-tap left or right half of the screen to seek 10 seconds backward or forward.
- Swipe down to exit fullscreen mode.

---

## 📦 Production Deployment (Ubuntu / Debian)

Deploy WatchRoom in production with a single script:

```bash
# HTTP testing
sudo bash install-v2.sh

# HTTPS with automatic Caddy TLS certificate
sudo DOMAIN=watch.example.com bash install-v2.sh
```

This installs system dependencies, creates system user `watchroom`, sets up the media storage directory at `/var/lib/watchroom/media`, configures `watchroom-egress.service` and `watchroom.service`, and verifies server health.

---

## 📚 Documentation

Detailed technical documentation is available in the [`docs/`](docs/) directory:

- [Architecture & Design Guide](docs/ARCHITECTURE.md)
- [Media Conversion Pipeline](docs/MEDIA_PIPELINE.md)
- [Security & SSRF Guard](docs/SECURITY.md)
- [REST API & Socket.IO Events](docs/API_AND_EVENTS.md)
- [Deployment & Operational Runbook](docs/DEPLOYMENT.md)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
