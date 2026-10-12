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

# Ensure Node 20+ is present
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]]; then
  echo "Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
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
if [[ "$SCRIPT_DIR" != "$APP_DIR" ]]; then
  rsync -av --exclude 'node_modules' --exclude '.git' --exclude 'web/node_modules' "$SCRIPT_DIR/" "$APP_DIR/"
fi

# Set permissions
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Install production dependencies
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --production

# Build web frontend if web folder exists
if [[ -d "$APP_DIR/web" ]]; then
  echo "Building frontend client..."
  cd "$APP_DIR/web"
  sudo -u "$APP_USER" npm install
  sudo -u "$APP_USER" npm run build
  mkdir -p "$APP_DIR/public"
  cp -r "$APP_DIR/web/dist/"* "$APP_DIR/public/"
  cd "$APP_DIR"
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

# Check 2: Egress guard blocks private addresses
BLOCKED_EXIT=0
sudo -u "$APP_USER" curl -m 3 http://10.0.0.1/ >/dev/null 2>&1 || BLOCKED_EXIT=$?
if [[ "$BLOCKED_EXIT" -ne 0 ]]; then
  echo " [PASS] Check 2: Egress guard successfully blocked private network (exit=$BLOCKED_EXIT)."
else
  echo " [WARN] Check 2: Egress guard did NOT block private IP 10.0.0.1!" >&2
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
