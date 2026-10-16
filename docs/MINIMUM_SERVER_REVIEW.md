# Minimum server review

## Verdict

WatchRoom can be installed on a 1 vCPU / 1 GB RAM server, but that should be treated as a low-traffic, best-effort setup. It is reasonable for the app, one or two viewers, and mostly direct MP4/WebM/HLS playback. Direct links are fetched by viewers' browsers, so they do not consume the server's video-encoding capacity.

It is not a dependable general-purpose MKV transcoding size. MKV conversion runs FFmpeg on the server. H.264 video is copied, but audio is still encoded to AAC; HEVC, AV1, and other non-H.264 video are encoded to H.264. A single such encode can saturate one CPU core and make the site and playback preparation feel slow. This repository has not been benchmarked under a 1 GB memory limit, so the guidance here is based on the current implementation rather than a measured concurrency guarantee.

## What the current deployment uses

- One Node.js process runs Express, Socket.IO, and SQLite. Caddy is an optional second container for HTTP or automatic HTTPS.
- FFprobe and FFmpeg run as child processes for server-converted sources.
- The converter permits up to four active/cached movie jobs and one simultaneous non-H.264 video encode. Those are fixed application limits; Compose does not set CPU or memory limits, and the media directory has no quota.
- The deployment script builds the application image on the target server. Image build and package installation need temporary disk, memory, and CPU in addition to the steady-state runtime.
- Converted media uses disk space in `./media`; the cache is cleared when the application starts. SQLite state persists in `./data`.

## Recommended sizes

| Server | Suitable use |
| --- | --- |
| 1 vCPU / 1 GB RAM | Trial or small private room, mostly direct browser-playable sources. Allow swap and expect MKV conversion to be slow or unavailable while another task is running. |
| 2 vCPU / 2 GB RAM | Sensible starting point for a small private deployment with occasional H.264 MKV conversion. |
| 4+ vCPU / 4+ GB RAM | Better headroom for frequent non-H.264 conversions, larger files, or other services on the same host. |

These are starting points, not promises about simultaneous streams. Source codec, resolution, bitrate, remote-host speed, subtitles, and how many rooms convert at once all affect capacity.

## If using 1 vCPU / 1 GB

1. Keep the host dedicated to WatchRoom and its reverse proxy. Do not run a database server or other memory-heavy services alongside it.
2. Add 1–2 GB of swap if the provider permits it. Swap can reduce abrupt out-of-memory kills, but it does not make FFmpeg encoding fast.
3. Build the Docker image elsewhere and deploy the built image if the host repeatedly runs out of memory during `deploy.sh`; the current helper builds locally by default.
4. Prefer direct MP4/WebM/HLS links or H.264 MKV files. Avoid relying on HEVC/AV1 conversion for an uninterrupted viewing experience on one core.
5. Avoid starting several new conversions at once. Current job limits are fixed in code and are not exposed as deployment settings.
6. Monitor `free -h`, `df -h`, and `docker stats` during a realistic test with two viewers. Leave room on disk for source downloads and generated HLS segments.
7. Before relying on the instance, test one representative MKV including its subtitle and audio tracks. Confirm that playback starts, continues as segments arrive, and the process remains healthy under the actual source file and network conditions.

## Follow-up improvements for a minimum-server mode

The deployment could be made more predictable on tiny machines by exposing job and re-encode limits as environment settings, defaulting low-memory installs to one active job, adding a configurable media-cache quota, and documenting an image-pull deployment path that avoids building on the server. Those controls are not currently implemented. A provider-specific benchmark should be run before advertising a guaranteed viewer or conversion count.
