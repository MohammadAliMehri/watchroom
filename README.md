<div align="center">

# watchroom.

### Good stories.<br><em>Better together.</em>

Movie night with your favorite people, wherever you are.

[Get started](#make-it-your-movie-night) · [See how it works](docs/USAGE.md) · [Self-host WatchRoom](#bring-watchroom-home)

</div>

<p align="center"><a href="https://mohammadalimehri.github.io/watchroom/">Explore the WatchRoom project page ↗</a></p>

<p align="center">
  <img src="docs/images/watchroom-home.png" alt="WatchRoom home page: a calm, cinematic space to plan a movie night together" width="100%">
</p>

<p align="center"><em>Your people. Your place. Your next favorite series.</em></p>

WatchRoom makes it easy to turn a long-distance evening into a shared movie night. Create a room, invite your person or your group, and press play together. Playback stays in sync, while chat, reactions, and the next-episode queue keep the fun in one place.

## Make it your movie night

|  |  |
| --- | --- |
| 🎬 **Stay in sync** | Play, pause, seek, and move to the next episode together. Reconnect and pick up where the room left off. |
| 💬 **Keep the conversation close** | Chat and react beside the player, with your friends right there in the room. |
| 🍿 **Make a shared watchlist** | Add a movie or queue up a whole season. Choose shared controls or let the host take the lead. |
| 🌙 **Make it feel like yours** | Create private, password-protected rooms, see who's watching, and settle in with theater mode. |
| 💜 **Watch your way** | Choose embedded text subtitles and audio tracks, or add your own SRT/VTT subtitle. |
| 📺 **Bring your media** | Play direct MP4, WebM, and HLS links. The server converts MKV and other formats to HLS, with embedded text subtitles when supported. |
| 🏡 **Make it your own** | Run WatchRoom on your server with Docker Compose and optional automatic HTTPS. |

> **Bring your own media:** WatchRoom does not include a catalog or bypass DRM. Use direct media links you have permission to share. Server-side conversion uses CPU and disk space; H.264 sources are lighter than HEVC/AV1. See the [minimum server review](docs/MINIMUM_SERVER_REVIEW.md) before choosing a small server.

## Bring WatchRoom home

The interactive setup script gets WatchRoom running on a fresh Ubuntu or Debian server. It guides you through domain setup with automatic HTTPS, or IP access over HTTP.

```bash
git clone https://github.com/MohammadAliMehri/watchroom.git
cd watchroom
sudo bash deploy.sh
```

For a domain, point DNS to your server and allow inbound TCP ports 80 and 443 in your cloud firewall. For IP mode, allow TCP port 80; that connection is not encrypted. The installer configures Docker, builds and starts WatchRoom, then checks the app and reverse proxy.

After setup, create an account and room, then invite someone to join. Follow the [two-person watch guide](docs/USAGE.md) and the [deployment checks](docs/DEPLOYMENT.md#before-inviting-friends) to try a real room.

### Run with Docker Compose

For an existing Docker host and domain, configure the hostname and allowed origin, then start the HTTPS profile:

```bash
cp .env.example .env
# Edit DOMAIN and ALLOWED_ORIGINS in .env.
docker compose --profile https up --build -d
```

Caddy obtains and renews TLS certificates. App data persists in `./data`; disposable converted media is stored in `./media`. The app needs `NET_ADMIN` during startup to install its media egress guard, then drops capabilities before running Node.js and FFmpeg. Startup stops if the guard cannot be installed.

For backups, upgrades, resource requirements, and troubleshooting, see the [deployment guide](docs/DEPLOYMENT.md).

## Develop locally

Use Node.js 24 (minimum 22.13) and install `ffmpeg` and `ffprobe` on your PATH.

```bash
npm ci
npm ci --prefix web
npm start
# In another terminal:
npm run dev --prefix web -- --host 127.0.0.1
```

Open Vite on port 5173. API, media, and WebSocket requests are proxied to Express on port 3000. No external database or credentials are required for local development.

```bash
npm test               # Auth, rooms, persistence, MKV and subtitles
npm run lint           # Frontend checks
npm run build:web      # TypeScript and production web build
npm run smoke          # Health and frontend asset check
```

Express serves `web/dist` when built, falling back to packaged `public` assets. Generated builds do not modify committed bundles.

For local remote-media conversion, `ALLOW_UNSAFE_MEDIA_FETCHES=true` is available as a development override. Keep it local; use the protected Docker deployment for a public server.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Express port; Compose publishes it on loopback only. |
| `DB_PATH` | `data/watchroom.db` | SQLite database path; Docker uses `/app/data/watchroom.db`. |
| `MEDIA_DIR` | `media/` | Disposable conversion cache; Docker uses `/app/media`. |
| `ALLOWED_ORIGINS` | unset | Allowed browser origins; set the exact HTTPS origin in production. |
| `SESSION_DAYS` | `30` | Login session lifetime. |
| `DOMAIN` | `localhost` | Caddy hostname when the `https` profile is enabled. |

Do not set `MEDIA_EGRESS_PROTECTED` manually. The protected startup path sets it only after installing firewall rules.

## Explore WatchRoom

[Watching guide](docs/USAGE.md) · [Deployment](docs/DEPLOYMENT.md) · [Media pipeline](docs/MEDIA_PIPELINE.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [API and events](docs/API_AND_EVENTS.md) · [Product roadmap](docs/PRODUCT_ROADMAP.md)

MIT licensed. See [LICENSE](LICENSE).
