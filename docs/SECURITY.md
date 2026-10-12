# WatchRoom v2 Security Specification

Because WatchRoom can fetch and transcode user-provided video URLs, server-side media conversion is guarded by application URL checks and an operating-system egress firewall. Production conversion fails closed unless the service is configured to run behind that firewall.

---

## 1. Two-Layer SSRF Defense

```
User URL Request  ──▶  Layer 1: Application DNS/IP Check (src/security.js)
                             │
                             ├─▶ If Private / Reserved IP ──▶ Refused: "That address is not allowed"
                             │
                             ▼ Passes Layer 1
                       Layer 2: OS Firewall Guard (watchroom-egress.sh)
                             │
                             ├─▶ If DNS Rebinding / IP Drift ──▶ Blocked at Kernel (iptables)
                             ▼
                       Public Internet Video Fetch
```

### Layer 1: Application Validation (`src/security.js`)

Before any external fetch or probe is triggered:
1. **Protocol Restriction**: Only `http:` and `https:` schemes are accepted. Protocols such as `ftp:`, `file:`, `gopher:`, `data:`, or `dict:` are immediately rejected.
2. **DNS Resolution**: The hostname is resolved via `dns.promises.lookup` to retrieve all associated IPv4 and IPv6 addresses.
3. **Blacklisted IP Ranges**: Every resolved address is evaluated against:
   - Private Class A: `10.0.0.0/8`
   - Private Class B: `172.16.0.0/12` (`172.16.0.0` - `172.31.255.255`)
   - Private Class C: `192.168.0.0/16`
   - Loopback: `127.0.0.0/8` and IPv6 `::1`
   - Cloud Metadata & Link-Local: `169.254.0.0/16` (protects AWS/GCP/Azure instance metadata endpoints like `http://169.254.169.254/`)
   - Carrier-Grade NAT: `100.64.0.0/10`
   - Unspecified / Broadcast / Multicast: `0.0.0.0/8`, `224.0.0.0/4`, `255.255.255.255/32`
   - IPv6 Local Ranges: Link-local (`fe80::/10`) and Unique Local (`fc00::/7`)

If any IP matches a forbidden range, the server throws:
`"That address is not allowed"`
*(Mapped in the user interface to "This address can't be used." without exposing security rules)*.

Before `ffprobe` or `ffmpeg` is allowed to process an HTTP(S) source, the application also requires `MEDIA_EGRESS_PROTECTED=true`. In non-production development, remote conversion is disabled unless `ALLOW_UNSAFE_MEDIA_FETCHES=true` is explicitly set. That override is for trusted local testing only; it does not protect against DNS rebinding and must not be enabled on an exposed server.

---

### Layer 2: Kernel Firewall Guard (`scripts/watchroom-egress.sh`)

Layer 1 does not defend against **DNS Rebinding**, where an attacker's domain resolves to a benign public IP during validation, but subsequently resolves to `127.0.0.1` or `169.254.169.254` when `ffmpeg` establishes its connection.

Layer 2 blocks the actual destination at the Linux kernel level, including if DNS changes or an HTTP redirect points at a private address:
- The server runs under a dedicated system user (`watchroom`).
- `iptables` rules matching the user's UID (`--uid-owner watchroom`) reject outbound traffic destined for private and metadata subnets:
  ```bash
  iptables -A WATCHROOM_EGRESS -d 10.0.0.0/8 -j REJECT
  iptables -A WATCHROOM_EGRESS -d 172.16.0.0/12 -j REJECT
  iptables -A WATCHROOM_EGRESS -d 192.168.0.0/16 -j REJECT
  iptables -A WATCHROOM_EGRESS -d 169.254.0.0/16 -j REJECT
  iptables -A WATCHROOM_EGRESS -d 127.0.0.0/8 -j REJECT
  iptables -A WATCHROOM_EGRESS -d 100.64.0.0/10 -j REJECT
  ```
- Local DNS resolver access (`127.0.0.53:53` or custom resolver) is explicitly allowed so the application can resolve public hostnames.
- `watchroom.service` requires `watchroom-egress.service` and sets `MEDIA_EGRESS_PROTECTED=true`, so the application will not start without the firewall unit.
- The Linux installer is the supported production deployment path. Other deployment environments must provide an equivalent OS/container egress policy before enabling the protection flag. Remote conversion otherwise fails closed; only direct browser playback avoids the server-side media fetch path.

The protection flag is a deployment assertion, not an application-level firewall probe. Do not set it manually unless the egress rules are actually active.

---

## 2. Room Access Security

- **Private by Default**: All rooms require a password between 4 and 100 characters.
- **Password Storage**: Room passwords are stored as scrypt hashes; existing plaintext rows are migrated at startup.
- **Host Controls Mode**: Room owners can enable host-only control mode, preventing unauthorized viewers from skipping, pausing, seeking, or changing playlist items.
- **Media Path Privacy**: Converted files are stored under cryptographic hashes (`/media/<hash>/index.m3u8`), preventing trivial enumeration of active movie files.
