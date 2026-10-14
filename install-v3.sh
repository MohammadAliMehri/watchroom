#!/usr/bin/env bash
# WatchRoom v3 installer & upgrade script
# Adds SQLite/PostgreSQL support, user accounts, and backups.
set -euo pipefail

echo "=========================================="
echo "   WatchRoom v3 Installer & Upgrader      "
echo "=========================================="

APP_DIR="/opt/watchroom"
STATE_DIR="/var/lib/watchroom"
MEDIA_DIR="$STATE_DIR/media"
DB_PATH="$STATE_DIR/watchroom.db"
ENV_DIR="/etc/watchroom"
ENV_FILE="$ENV_DIR/watchroom.env"
APP_USER="watchroom"
DOMAIN="${DOMAIN:-}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo bash install-v3.sh)" >&2
   exit 1
fi

echo "[1/6] Installing dependencies (ffmpeg, iptables, curl, rsync, sqlite3, nodejs)..."
apt-get update -qq
apt-get install -y -qq ffmpeg iptables curl ufw sqlite3 rsync ca-certificates gnupg
if [[ -n "$DATABASE_URL" ]]; then
  apt-get install -y -qq postgresql-client
fi

# Ensure Node.js >= 22.13.0 is present
if ! command -v node >/dev/null 2>&1 || ! dpkg --compare-versions "$(node -v | sed 's/^v//')" ge "22.13.0"; then
  echo "Installing Node.js 24 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi

echo "[2/6] Setting up system user and directories..."
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
fi

mkdir -p "$APP_DIR" "$MEDIA_DIR" "$STATE_DIR"
chown -R "$APP_USER":"$APP_USER" "$STATE_DIR"
chmod 750 "$MEDIA_DIR" "$STATE_DIR"

echo "[3/6] Deploying application files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
systemctl stop watchroom.service 2>/dev/null || true
if [[ "$SCRIPT_DIR" != "$APP_DIR" ]]; then
  rsync -av --exclude 'node_modules' --exclude '.git' --exclude 'web/node_modules' --exclude '/data/' --exclude '/media/' "$SCRIPT_DIR/" "$APP_DIR/"
fi

# Migrate a legacy SQLite database to $DB_PATH if none exists yet
if [[ -f "$APP_DIR/data/watchroom.db" && ! -f "$DB_PATH" ]]; then
  echo "Migrating legacy room database to $DB_PATH..."
  install -o "$APP_USER" -g "$APP_USER" -m 640 "$APP_DIR/data/watchroom.db" "$DB_PATH"
elif [[ -f "$STATE_DIR/data/watchroom.db" && ! -f "$DB_PATH" ]]; then
  echo "Migrating legacy room database to $DB_PATH..."
  install -o "$APP_USER" -g "$APP_USER" -m 640 "$STATE_DIR/data/watchroom.db" "$DB_PATH"
fi

# Set permissions
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Install production dependencies
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

# Runtime environment (root-only; holds DATABASE_URL). Kept across upgrades unless DATABASE_URL is passed again.
mkdir -p "$ENV_DIR"
if [[ -n "$DATABASE_URL" || ! -f "$ENV_FILE" ]]; then
  (
    umask 077
    echo "DB_PATH=$DB_PATH" > "$ENV_FILE"
    if [[ -n "$DATABASE_URL" ]]; then echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"; fi
  )
fi
chmod 600 "$ENV_FILE"

# pg is only needed for PostgreSQL; --no-save keeps package.json/lockfile untouched
if [[ -n "$DATABASE_URL" ]] || grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "PostgreSQL configured. Installing pg driver..."
  sudo -u "$APP_USER" npm install --no-save pg
fi

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

# Setup backup daily cron job (keeping 14 days)
mkdir -p /var/backups/watchroom
cat <<'EOF' > /etc/cron.daily/watchroom-backup
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/var/backups/watchroom"
umask 077
mkdir -p "$BACKUP_DIR"
DATE="$(date +%Y%m%d_%H%M%S)"

set -a
[[ -f /etc/watchroom/watchroom.env ]] && . /etc/watchroom/watchroom.env
set +a

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/watchroom_$DATE.sql"
elif [[ -f "/var/lib/watchroom/watchroom.db" ]]; then
  sqlite3 /var/lib/watchroom/watchroom.db ".backup $BACKUP_DIR/watchroom_$DATE.db"
fi

# Keep 14 days of backups
find "$BACKUP_DIR" -type f -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/watchroom-backup

echo "[5/6] Starting WatchRoom service..."
systemctl enable --now watchroom.service

# Setup Caddy reverse proxy if DOMAIN is specified
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

echo ""
echo "WatchRoom v3 installation complete!"
if [[ -n "$DOMAIN" ]]; then
  echo "Access your room at: https://$DOMAIN"
else
  echo "Access your room at: http://YOUR_SERVER_IP:3000"
fi
