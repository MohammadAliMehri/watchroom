# WatchRoom v2 Deployment & Operations Guide

This guide covers production deployment on Ubuntu / Debian systems, systemd services, automated reverse proxies, and ongoing operational commands.

---

## 1. Quick Automated Install

Copy the repository to the server and run the automated installer:

### For HTTP Testing
```bash
sudo bash install-v2.sh
```

### For Production HTTPS (Automatic SSL Certificate)
```bash
sudo DOMAIN=watch.example.com bash install-v2.sh
```

The installer will:
1. Install `ffmpeg`, `iptables`, `curl`, and Node.js 24 LTS when the installed version is below 22.13.
2. Create the system user `watchroom`.
3. Set up `/var/lib/watchroom/media` and `/var/lib/watchroom/data`.
4. Build the React frontend into the canonical `public/` directory.
5. Install and enable `watchroom-egress.service` and `watchroom.service`.
6. Configure Caddy for automated TLS certificates (if `DOMAIN` is supplied).
7. Execute post-install verification checks (health, firewall guard, public access).

The production systemd service requires the egress firewall unit. Do not set `MEDIA_EGRESS_PROTECTED=true` in another deployment unless an equivalent OS/container egress policy is active. Local development can opt into unprotected remote conversion with `ALLOW_UNSAFE_MEDIA_FETCHES=true`; never expose that mode to untrusted users.

During upgrades, the installer stops the existing service and migrates `/opt/watchroom/data/watchroom.db` to `/var/lib/watchroom/data/watchroom.db` only when the destination database does not already exist. Workspace `data/` and `media/` directories are excluded from deployment sync.

---

## 2. Resource Guidelines

| Resource | Usage Pattern | Recommendation |
|---|---|---|
| **Disk** | About the size of each converted movie (up to 4 movies kept concurrently). | Plan for $4 \times$ your largest movie $+ 10\text{ GB}$ headroom. |
| **CPU (Copy mode)** | Negligible CPU usage; limited only by network transfer speed. | 1 vCPU is sufficient for copy mode. |
| **CPU (Re-encode)** | Intensive; roughly real-time or slower per stream on 1 vCPU. | Prefer H.264 sources. For frequent HEVC/AV1, use 4+ vCPUs. |
| **RAM** | $\sim 60\text{--}90\text{ MB}$ for Node server, $+ 50\text{--}150\text{ MB}$ per active ffmpeg process. | 1 GB RAM is sufficient (`MemoryMax=1G`). |
| **Bandwidth** | One movie download per conversion, not per viewer. | Sufficient inbound speed for video sources. |

---

## 3. Operations & Maintenance Cheat Sheet

### View Server Logs
```bash
journalctl -u watchroom -f
```

### Check Active Conversions in Progress
```bash
ps -u watchroom -o pid,etime,args | grep ffmpeg
```

### Inspect Media Disk Usage
```bash
du -sh /var/lib/watchroom/media
```

### Flush Media Cache & Restart
```bash
sudo systemctl restart watchroom
```

### Inspect Egress Firewall Rules
```bash
sudo iptables -L WATCHROOM_EGRESS -n -v --line-numbers
```

### Re-apply Firewall Guard
```bash
sudo systemctl restart watchroom-egress
```

---

## 4. Verification Tests

To verify the egress firewall manually:

```bash
# Should FAIL (blocked by kernel firewall for watchroom user while the server is running):
sudo -u watchroom curl -m 3 http://127.0.0.1:3000/healthz ; echo "exit=$?"

# Should SUCCEED (reaches public internet):
sudo -u watchroom curl -m 5 -o /dev/null -w '%{http_code}\n' https://www.google.com
```
