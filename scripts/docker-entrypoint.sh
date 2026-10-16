#!/usr/bin/env bash
set -euo pipefail

# Apply a real, per-user firewall before enabling remote FFmpeg input.
# The container needs NET_ADMIN only during this root initialization step.
export DNS_RESOLVER="${DNS_RESOLVER:-$(awk '/^nameserver / { print $2; exit }' /etc/resolv.conf)}"
/usr/local/bin/watchroom-egress
chown -R --no-dereference watchroom:watchroom /app/data /app/media
export MEDIA_EGRESS_PROTECTED=true
unset ALLOW_UNSAFE_MEDIA_FETCHES

# Application and FFmpeg run without root privileges or retained capabilities.
exec setpriv --reuid=watchroom --regid=watchroom --init-groups \
  --bounding-set=-all --no-new-privs "$@"
