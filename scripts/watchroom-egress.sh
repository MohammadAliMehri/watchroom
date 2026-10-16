#!/usr/bin/env bash
# WatchRoom container egress guard
# Blocks the 'watchroom' user from reaching private/internal networks to prevent SSRF and DNS rebinding
set -euo pipefail

USER_NAME="watchroom"
RESOLVER_IP="${DNS_RESOLVER:-127.0.0.53}"

# Remove existing OUTPUT jumps before replacing the chains.
while iptables -D OUTPUT -m owner --uid-owner "$USER_NAME" -j WATCHROOM_EGRESS 2>/dev/null; do :; done
while ip6tables -D OUTPUT -m owner --uid-owner "$USER_NAME" -j WATCHROOM_EGRESS 2>/dev/null; do :; done
iptables -F WATCHROOM_EGRESS 2>/dev/null || true
iptables -X WATCHROOM_EGRESS 2>/dev/null || true
ip6tables -F WATCHROOM_EGRESS 2>/dev/null || true
ip6tables -X WATCHROOM_EGRESS 2>/dev/null || true

# Create custom chains
iptables -N WATCHROOM_EGRESS
ip6tables -N WATCHROOM_EGRESS

# Direct traffic for watchroom user to the custom chain
iptables -I OUTPUT 1 -m owner --uid-owner "$USER_NAME" -j WATCHROOM_EGRESS

ip6tables -I OUTPUT 1 -m owner --uid-owner "$USER_NAME" -j WATCHROOM_EGRESS

# 1. Allow established connections
iptables -A WATCHROOM_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A WATCHROOM_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 2. Allow DNS lookup to the local resolver
iptables -A WATCHROOM_EGRESS -d "$RESOLVER_IP" -p udp --dport 53 -j ACCEPT
iptables -A WATCHROOM_EGRESS -d "$RESOLVER_IP" -p tcp --dport 53 -j ACCEPT

# 3. Drop private / metadata / internal traffic. DROP also works on hosts
# without the optional IPv6 REJECT kernel extension.
# 127.0.0.0/8 (Loopback)
iptables -A WATCHROOM_EGRESS -d 127.0.0.0/8 -j DROP
# Unspecified and multicast/reserved IPv4 destinations
iptables -A WATCHROOM_EGRESS -d 0.0.0.0/8 -j DROP
iptables -A WATCHROOM_EGRESS -d 224.0.0.0/4 -j DROP
iptables -A WATCHROOM_EGRESS -d 255.255.255.255/32 -j DROP
# 10.0.0.0/8 (Private class A)
iptables -A WATCHROOM_EGRESS -d 10.0.0.0/8 -j DROP
# 172.16.0.0/12 (Private class B)
iptables -A WATCHROOM_EGRESS -d 172.16.0.0/12 -j DROP
# 192.168.0.0/16 (Private class C)
iptables -A WATCHROOM_EGRESS -d 192.168.0.0/16 -j DROP
# 169.254.0.0/16 (Link-local & cloud metadata 169.254.169.254)
iptables -A WATCHROOM_EGRESS -d 169.254.0.0/16 -j DROP
# 100.64.0.0/10 (Carrier-grade NAT)
iptables -A WATCHROOM_EGRESS -d 100.64.0.0/10 -j DROP

# IPv6 forbidden ranges
ip6tables -A WATCHROOM_EGRESS -d ::1/128 -j DROP
ip6tables -A WATCHROOM_EGRESS -d ::/128 -j DROP
ip6tables -A WATCHROOM_EGRESS -d ::ffff:0:0/96 -j DROP
ip6tables -A WATCHROOM_EGRESS -d fe80::/10 -j DROP
ip6tables -A WATCHROOM_EGRESS -d fc00::/7 -j DROP
ip6tables -A WATCHROOM_EGRESS -d ff00::/8 -j DROP

# 4. Default policy for this chain: ACCEPT public internet traffic
iptables -A WATCHROOM_EGRESS -j ACCEPT
ip6tables -A WATCHROOM_EGRESS -j ACCEPT

echo "[WatchRoom] Egress guard iptables rules applied for user '$USER_NAME'."
