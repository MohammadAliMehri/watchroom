# Host your own WatchRoom

WatchRoom runs on a Linux server with Docker Engine and Docker Compose v2. Use a public DNS name for automatic HTTPS. The web interface, SQLite database, room chat, FFmpeg and subtitle extraction run together; no external database or API keys are required.

## Interactive Ubuntu/Debian setup

On a fresh Ubuntu or Debian server, open inbound TCP port 80 for HTTP and TCP 443 for HTTPS in the cloud provider firewall. For automatic HTTPS, point a public DNS A record (and an AAAA record only when IPv6 is reachable) at the server. Then run:

```bash
git clone https://github.com/MohammadAliMehri/watchroom.git
cd watchroom
sudo bash deploy/setup.sh
```

The setup installs Docker Engine/Compose if missing, asks whether you will use a domain or public IP, writes a private `.env`, builds the app, starts the matching Caddy proxy, and checks `/healthz`. Domain mode uses Caddy's automatic certificate issuance and renewal; the DNS name must resolve to the server, and ports 80/443 must be reachable from the internet. IP mode serves HTTP on port 80 only. Publicly trusted TLS for IP addresses is not configured, so use a domain when login and room traffic need encryption. The script can add UFW rules when UFW is already active; cloud firewall rules remain the operator's responsibility.

Run the script from the cloned repository directory. It preserves an existing `.env` as a timestamped backup before selecting a new public origin. Re-running it rebuilds the app and reconfigures the chosen access mode while retaining `data/`, `media/`, and Caddy's certificate volume.

## Start locally

```bash
git clone https://github.com/MohammadAliMehri/watchroom.git
cd watchroom
docker compose up --build -d
curl --fail http://127.0.0.1:3000/healthz
docker compose logs -f watchroom
```

HTTP binds to the server's loopback interface by default. For remote testing, use `ssh -L 3000:127.0.0.1:3000 user@server` and open port 3000 on your own machine. For friends outside your network, enable HTTPS below.

## Public server with automatic HTTPS

1. Point an A record (and an AAAA record only if IPv6 works) for your hostname at the server.
2. Allow inbound TCP 80 and 443 in your server firewall. UDP 443 is optional for HTTP/3.
3. Copy the public configuration template and replace both example hostnames:

```bash
cp .env.example .env
# Edit .env: DOMAIN=watch.your-domain.com
#            ALLOWED_ORIGINS=https://watch.your-domain.com
docker compose --profile https up --build -d
```

Caddy obtains and renews TLS certificates and proxies HTTP and Socket.IO WebSockets to the app. Visit `https://watch.your-domain.com`, create an account and a room, paste a direct media URL into the playlist, and use **Invite friends**. Share the room password separately. Each viewer chooses their own subtitles; playback and audio-track changes are shared by the room.

If you already have a reverse proxy, omit the HTTPS profile and proxy to `127.0.0.1:3000`. Preserve the Host header, forward the original HTTPS scheme, and support WebSocket upgrades. Set `ALLOWED_ORIGINS` to your exact public origin.

## Remote media protection

The container starts as root only to install user-specific IPv4 and IPv6 egress firewall rules. It then drops all capabilities and runs Node and FFmpeg as the unprivileged `watchroom` user. Compose grants `NET_ADMIN` for that initialization; the application does not retain it. This requires a Docker host that supports iptables/ip6tables. Managed platforms that prohibit network administration cannot use this deployment unchanged.

Startup fails if firewall installation fails. Do not bypass it or set `MEDIA_EGRESS_PROTECTED=true` by hand. Requests to private, loopback, link-local, multicast, and metadata addresses are blocked. Only DNS to the configured resolver is allowed before those destination blocks. `DNS_RESOLVER` is discovered from the container's `/etc/resolv.conf`; override it only if your infrastructure needs a different resolver.

A failed protected startup appears in `docker compose logs watchroom`. On platforms without `NET_ADMIN`, use a host firewall with the documented systemd installer instead, or provide an equivalent infrastructure egress policy and a separately reviewed container entrypoint.

## Formats, subtitles and capacity

- Direct MP4, WebM and HLS links play through the viewer's browser. The media host must support browser playback and CORS where required. A web page URL, DRM stream or subscription-service URL is not a direct media link.
- MKV and other incompatible containers are fetched on the server and converted to HLS. H.264 video is copied; other codecs are encoded to H.264. Audio is normalized to stereo AAC.
- Every embedded text subtitle stream (SRT, ASS/SSA, WebVTT and mov_text) is converted to a selectable WebVTT track with its language and title. ASS styling is reduced to plain cues. Image subtitles such as PGS/DVD are not converted. Viewers can upload a local SRT or VTT as an alternative; it stays in their browser.
- Conversion currently finishes before playback starts. Large files and HEVC re-encoding can take time. Prefer H.264 MKV sources, fast media hosting and a server with at least 2 vCPUs / 2 GB RAM; 4+ vCPUs helps with HEVC.
- Up to four cached/active movie jobs and one heavy encode are supported. Allow enough disk space for four of your largest converted movies. Media cache is disposable and clears on app startup.
- The host needs outbound access and DNS for your media hosts. Native FFmpeg fetches do not use browser cookies or proxy-injected API credentials.
- Only stream content you have permission to share.

## Data, backups and upgrades

The existing `./data` and `./media` bind mounts retain SQLite and media. Caddy uses named volumes for TLS certificates and configuration. Existing deployments keep the same data paths. Startup assigns the two writable directories and their existing files to the container's `watchroom` user, including databases created by older root-based deployments.

A simple consistent backup of the new deployment:

```bash
mkdir -p backups
docker compose stop watchroom
docker compose cp watchroom:/app/data ./backups/data-$(date +%Y%m%d-%H%M%S)
docker compose start watchroom
```

Backups contain account and session data; restrict access. Do not use `docker compose down -v` unless you intend to delete Caddy certificates; never delete `data/` unless you intend to remove all accounts and rooms.

Upgrade without removing data:

```bash
git pull --ff-only
docker compose --profile https up --build -d
curl --fail https://watch.your-domain.com/healthz
```

Use the same Compose project directory/name so Docker reuses the Caddy volumes. SQLite migrations run automatically at startup. Back up before upgrades, especially before returning to an older app version.

## Development without Docker

Install Node.js 24 (minimum 22.13) and FFmpeg/FFprobe, then:

```bash
npm ci
npm ci --prefix web
npm start
# In another terminal:
npm run dev --prefix web -- --host 127.0.0.1
```

Vite on port 5173 serves source changes and proxies API/WebSocket/media requests to Express on port 3000. SQLite defaults to ignored `data/watchroom.db`; media defaults to ignored `media/`.

```bash
npm test
npm run lint
npm run build:web
npm run smoke
```

The frontend builds into ignored `web/dist/`, which Express prefers over the legacy `public/` assets. Docker copies that build into its packaged `public/` directory. Building never rewrites committed frontend bundles. No secrets are needed for the local workflow.

For local remote-media conversion only, the existing `ALLOW_UNSAFE_MEDIA_FETCHES=true` development override is available outside production. Do not expose that mode to untrusted users. Local file conversion is covered by automated FFmpeg fixture tests without that override.

## Systemd alternative

The existing Ubuntu/Debian installer installs dependencies, builds the frontend, runs the app as the `watchroom` user, configures the firewall service and adds daily SQLite backups. With a public hostname it also configures Caddy:

```bash
sudo DOMAIN=watch.your-domain.com bash install-v3.sh
sudo systemctl status watchroom watchroom-egress
sudo journalctl -u watchroom -f
```

This changes system packages and systemd configuration; run it on the server you intend to host. The full installer has not been executed inside the cloud development workspace. SQLite is the documented default; optional PostgreSQL code/installation exists but is not covered by the validated Compose workflow.

## Troubleshooting

| Symptom                                             | Check                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container exits with iptables permission errors     | The standard entrypoint requires `NET_ADMIN`, supported IPv4/IPv6 tables and a Linux Docker host. Inspect `docker compose logs watchroom`; do not enable the protection flag manually |
| Container cannot open its database                  | Inspect the data bind mount. Startup fixes ownership for old root-created SQLite files, but the host mount must permit ownership changes and writes                                   |
| Remote browser cannot reach port 3000               | Expected: the app binds to loopback on the host. Use the HTTPS profile or your reverse proxy; only ports 80/443 need public exposure                                                  |
| Caddy cannot obtain a certificate                   | Check domain spelling, public A/AAAA records, inbound 80/443, competing services on those ports and `docker compose --profile https logs caddy`                                       |
| Sign-in or sockets fail only on the public hostname | Set `ALLOWED_ORIGINS` to the exact scheme/hostname and ensure the proxy forwards WebSocket upgrades and the HTTPS scheme                                                              |
| Video URL is rejected before preparation            | Verify native DNS on the actual server and check that every address is public. Private/LAN sources are intentionally blocked                                                          |
| Preparation stays busy or fails                     | Check source expiration, required cookies, media-host access, disk space, FFmpeg availability and heavy-encode/job limits                                                             |
| Subtitles are missing                               | Only text streams convert to WebVTT. Use a local SRT/VTT for PGS/DVD-only sources                                                                                                     |
| Video resumes at the wrong point after an upgrade   | Rooms deliberately restore paused at the saved position; conversion/cache regeneration may still be required on first join                                                            |
| Queue-add request times out                         | Check the queue before repeating the request; a client timeout does not roll back server work                                                                                         |
| Build containers fail to resolve a corporate proxy  | Configure build-container DNS/host resolution for that proxy; the app runtime's resolver is a separate setting                                                                        |
| Package install reports a private/self-signed CA    | Supply your organization's trusted CA rather than disabling TLS verification                                                                                                          |

For a build proxy, Docker's predefined `HTTP_PROXY`/`HTTPS_PROXY` build arguments can use existing environment variables. The Dockerfile accepts an optional `build_ca` BuildKit secret for a trusted certificate file during npm installation:

```bash
docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --secret id=build_ca,src=/path/to/trusted-ca.pem \
  -t watchroom-local .
```

This only builds a local image; normal Compose deployments do not need these flags. Configure any proxy hostname mapping for your infrastructure. Do not hardcode cloud-specific proxy addresses or copy credentials into the Dockerfile. npm lockfile integrity, TLS checks and apt package verification remain enabled.

For data recovery, stop the app and preserve its current `data/` directory before restoring a known-good backup into an empty replacement directory. Keep SQLite database/WAL files from the same backup together. Recreate the app container so its bind mount uses the restored path; startup will fix service ownership and run migrations. Test recovery before relying on a backup, and do not restore an older app version over a newer schema without a migration plan.

Local `npm start` does not automatically load `.env`; export runtime variables or prefix the command, for example `DB_PATH=/path/to/watchroom.db npm start`. Compose reads the project `.env` for substitution.

## Before inviting friends

- Confirm `/healthz` returns `status: ok` and `db: connected` on the intended hostname.
- Use two browsers to test signup, a protected room, invitation, wrong-password rejection, chat and host-only playback.
- Test one direct source from both browsers and one MKV through the server's actual network. Confirm embedded text subtitles and at least one audio track.
- Expect complete conversion before MKV playback; test a realistic file size, not just a tiny fixture.
- Back up SQLite and verify restore. Keep the documented single-instance deployment until shared state/storage is implemented.

[Watching guide](USAGE.md) · [Media pipeline](MEDIA_PIPELINE.md) · [Security boundaries](SECURITY.md)
