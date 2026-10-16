#!/usr/bin/env bash
# Interactive Docker setup for a fresh Ubuntu or Debian server.
set -Eeuo pipefail

say() { printf '\nWatchRoom setup: %s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
WatchRoom deployment helper

Usage: sudo bash deploy.sh

Interactive setup for Ubuntu/Debian servers. It installs Docker if needed,
configures either a domain with automatic HTTPS or a public IP with HTTP,
builds WatchRoom, and starts the service.

Before starting, clone this repository and open the required ports in your
cloud firewall. Domain mode needs DNS pointing to the server and TCP 80/443.
IP mode needs TCP 80 and does not encrypt traffic.
HELP
  exit 0
fi

[[ $EUID -eq 0 ]] || fail "Run with sudo: sudo bash deploy.sh"
command -v apt-get >/dev/null || fail "This installer currently supports Ubuntu and Debian servers."

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker Engine and Compose from the Ubuntu/Debian package repositories..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git python3 docker.io docker-compose-v2
elif ! docker compose version >/dev/null 2>&1; then
  say "Installing the Docker Compose v2 plugin..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2
fi
if ! command -v python3 >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3
fi
if ! command -v curl >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y curl
fi
systemctl enable --now docker
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable. Install the Docker Compose plugin and run this script again."

printf '\nWelcome to WatchRoom. This setup will install Docker if needed, configure public access, build the app, and start it.\n'
printf 'Use a domain for secure HTTPS. An IP address works over unencrypted HTTP.\n\n'
printf 'How should friends reach this server?\n'
printf '  1) A domain name (recommended; automatic HTTPS certificate)\n'
printf '  2) An IP address (HTTP; no trusted TLS certificate)\n'
read -r -p 'Choose 1 or 2 [1]: ' mode
mode="${mode:-1}"

case "$mode" in
  1)
    read -r -p 'Domain name, for example watch.example.com: ' domain
    [[ -n "$domain" ]] || fail "A domain name is required."
    python3 - "$domain" <<'PY' || fail "Enter a valid DNS hostname, not an IP address or URL."
import ipaddress, re, sys
name = sys.argv[1].rstrip(".")
try:
    ipaddress.ip_address(name)
except ValueError:
    pass
else:
    raise ValueError("IP addresses are not DNS hostnames")
if len(name) > 253 or "." not in name:
    raise ValueError("expected a fully qualified hostname")
if any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in name.split(".")):
    raise ValueError("invalid DNS label")
PY
    domain="${domain%.}"
    if ! getent ahosts "$domain" >/dev/null 2>&1; then
      fail "The domain does not resolve from this server yet. Set its DNS A/AAAA record, wait for it to propagate, and retry."
    fi
    printf '\nBefore continuing, point the domain A/AAAA record to this server and allow inbound TCP 80 and 443.\n'
    read -r -p 'Is DNS pointed at this server and are ports 80/443 allowed? [y/N]: ' ready
    [[ "$ready" =~ ^[Yy]$ ]] || fail "Finish DNS and firewall setup, then run this script again."
    public_origin="https://${domain}"
    profile="https"
    public_url="$public_origin"
    ;;
  2)
    read -r -p 'Public server IPv4 or IPv6 address: ' server_ip
    [[ -n "$server_ip" ]] || fail "A public IP address is required."
    if [[ "$server_ip" == *:* ]]; then
      python3 - "$server_ip" <<'PY' || fail "Enter a valid IPv6 address."
import ipaddress, sys
address = ipaddress.IPv6Address(sys.argv[1])
if not address.is_global:
    raise ValueError("address must be public")
PY
      public_url="http://[${server_ip}]"
    else
      python3 - "$server_ip" <<'PY' || fail "Enter a valid IPv4 address."
import ipaddress, sys
address = ipaddress.IPv4Address(sys.argv[1])
if not address.is_global:
    raise ValueError("address must be public")
PY
      public_url="http://${server_ip}"
    fi
    printf '\nIP mode uses HTTP. Sign-in and room traffic will not be encrypted.\n'
    printf 'For HTTPS, use a domain pointed at this server and choose option 1.\n'
    read -r -p 'Allow inbound TCP port 80 in your server firewall and cloud firewall? [y/N]: ' ready
    [[ "$ready" =~ ^[Yy]$ ]] || fail "Allow inbound TCP port 80, then run this script again."
    public_origin="$public_url"
    profile="http"
    ;;
  *) fail "Choose 1 for a domain or 2 for an IP address." ;;
esac

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  if [[ "$profile" == https ]]; then
    ufw allow 80/tcp
    ufw allow 443/tcp
  else
    ufw allow 80/tcp
  fi
fi

env_file="$APP_DIR/.env"
if [[ -e "$env_file" ]]; then
  cp -p "$env_file" "$env_file.backup.$(date +%Y%m%d%H%M%S)"
fi
umask 077
cat > "$env_file" <<EOF
DOMAIN=${domain:-localhost}
ALLOWED_ORIGINS=${public_origin}
PORT=3000
EOF
chmod 600 "$env_file"

mkdir -p "$APP_DIR/data" "$APP_DIR/media"
chmod 750 "$APP_DIR/data" "$APP_DIR/media"

say "Building WatchRoom and starting the ${profile} deployment..."
docker compose stop caddy caddy-http >/dev/null 2>&1 || true
if [[ "$profile" == https ]]; then
  docker compose --profile https up -d --build
else
  docker compose --profile http up -d --build
fi

say "Checking application health..."
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/healthz >/dev/null; then
    break
  fi
  [[ "$attempt" -lt 30 ]] || {
    docker compose ps
    docker compose logs --tail=80 watchroom
    fail "WatchRoom did not become healthy. Review the logs above."
  }
  sleep 2
done

printf '\nWatchRoom is running at: %s\n' "$public_url"
if [[ "$profile" == https ]]; then
  printf 'Caddy is requesting and renewing the HTTPS certificate automatically.\n'
  printf 'If the URL is not ready yet, check: docker compose logs -f caddy\n'
else
  printf 'This IP setup has no TLS. Use a domain setup for encrypted HTTPS.\n'
fi
printf '\nManage it from %s:\n' "$APP_DIR"
printf '  docker compose ps\n  docker compose logs -f\n  docker compose down\n'
