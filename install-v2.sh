#!/usr/bin/env bash
# WatchRoom v2 installer & upgrade script
# Replaces v1 installer and upgrades an existing v1 server in place.
set -euo pipefail

echo "=========================================="
echo "   WatchRoom v2 Installer & Upgrader      "
echo "=========================================="

APP_DIR="/opt/watchroom"
MEDIA_DIR="/var/lib/watchroom/media"
DATA_DIR="/var/lib/watchroom/data"
APP_USER="watchroom"
DOMAIN="${DOMAIN:-}"

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo bash install-v2.sh)" >&2
   exit 1
fi

echo "[1/6] Installing dependencies (ffmpeg, iptables, curl, nodejs)..."
apt-get update -qq
apt-get install -y -qq ffmpeg iptables curl ufw

# Ensure the declared Node.js minimum is present
if ! command -v node >/dev/null 2>&1 || ! dpkg --compare-versions "$(node -v | sed 's/^v//')" ge "22.13.0"; then
  echo "Installing Node.js 24 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi

echo "[2/6] Setting up system user and directories..."
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
fi

mkdir -p "$APP_DIR" "$MEDIA_DIR" "$DATA_DIR"
chown -R "$APP_USER":"$APP_USER" "$MEDIA_DIR" "$DATA_DIR"
chmod 750 "$MEDIA_DIR" "$DATA_DIR"

echo "[3/6] Deploying application files..."
# Copy current workspace files to /opt/watchroom if running from repo
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
systemctl stop watchroom.service 2>/dev/null || true
if [[ "$SCRIPT_DIR" != "$APP_DIR" ]]; then
  rsync -av --exclude 'node_modules' --exclude '.git' --exclude 'web/node_modules' --exclude '/data/' --exclude '/media/' "$SCRIPT_DIR/" "$APP_DIR/"
fi

# Migrate the database from the old in-app location without overwriting existing persistent data.
if [[ -f "$APP_DIR/data/watchroom.db" && ! -f "$DATA_DIR/watchroom.db" ]]; then
  echo "Migrating the existing room database to $DATA_DIR..."
  install -o "$APP_USER" -g "$APP_USER" -m 640 "$APP_DIR/data/watchroom.db" "$DATA_DIR/watchroom.db"
fi

# Set permissions
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Install production dependencies
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

# Build web frontend if web folder exists
if [[ -d "$APP_DIR/web" ]]; then
  echo "Building frontend client..."
  sudo -u "$APP_USER" npm ci --prefix web
  sudo -u "$APP_USER" npm run build:web
fi

echo "[4/6] Installing egress guard firewall service..."
cp "$APP_DIR/scripts/watchroom-egress.sh" /usr/local/sbin/watchroom-egress.sh
chmod 755 /usr/local/sbin/watchroom-egress.sh

cp "$APP_DIR/scripts/watchroom-egress.service" /etc/systemd/system/watchroom-egress.service
cp "$APP_DIR/scripts/watchroom.service" /etc/systemd/system/watchroom.service

systemctl daemon-reload
systemctl enable --now watchroom-egress.service

echo "[5/6] Starting WatchRoom service..."
systemctl enable --now watchroom.service

# Setup Caddy / Nginx reverse proxy if DOMAIN is specified
if [[ -n "$DOMAIN" ]]; then
  echo "Setting up HTTPS with domain: $DOMAIN..."
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi

  cat <<EOF > /etc/caddy/Caddyfile
$DOMAIN {
    reverse_proxy 127.0.0.1:3000
}
EOF
  systemctl reload caddy
fi

echo "[6/6] Running verification checks..."
sleep 2

# Check 1: Healthcheck
HEALTH_STATUS=$(curl -s -m 5 http://127.0.0.1:3000/healthz | grep -o '"ok"' || true)
if [[ "$HEALTH_STATUS" == '"ok"' ]]; then
  echo " [PASS] Check 1: Server health check succeeded."
else
  echo " [WARN] Check 1: Server health check failed." >&2
fi

# Check 2: Egress guard blocks a real local service canary
if [[ "$HEALTH_STATUS" == '"ok"' ]] && ! sudo -u "$APP_USER" curl -fsS -m 3 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
  echo " [PASS] Check 2: Egress guard blocked loopback access to the running server."
else
  echo " [WARN] Check 2: Could not verify that the egress guard blocks loopback access." >&2
fi

# Check 3: Public internet access works for app user
ONLINE_CODE=$(sudo -u "$APP_USER" curl -m 5 -o /dev/null -s -w "%{http_code}\n" https://www.google.com || echo "000")
if [[ "$ONLINE_CODE" =~ ^(200|301|302)$ ]]; then
  echo " [PASS] Check 3: Public internet access functional for app user (HTTP $ONLINE_CODE)."
else
  echo " [WARN] Check 3: Public internet access failed or returned $ONLINE_CODE." >&2
fi

echo ""
echo "WatchRoom v2 installation complete!"
if [[ -n "$DOMAIN" ]]; then
  echo "Access your room at: https://$DOMAIN"
else
  echo "Access your room at: http://YOUR_SERVER_IP:3000"
fi
