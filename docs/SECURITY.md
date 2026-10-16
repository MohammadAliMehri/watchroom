# Security and trust boundaries

WatchRoom accepts user-supplied media URLs. The application validates URL schemes and resolved addresses, while the production deployment enforces network destination restrictions for the process that runs Node, FFprobe and FFmpeg. The remote-conversion protection flag is an assertion about the deployment, not a firewall probe or substitute for real rules.

## URL and network checks

`src/security.js` accepts HTTP/HTTPS room URLs and resolves all IPv4/IPv6 answers with native DNS lookup. A request is refused if any answer is private, loopback, link-local, carrier-grade NAT, multicast, unspecified or another forbidden/reserved range. IPv4-mapped IPv6 addresses are evaluated as their mapped IPv4 address. File/FTP/data URLs are not accepted through the room form.

FFprobe/FFmpeg network input also calls `assertMediaEgressProtection`. Production requires `MEDIA_EGRESS_PROTECTED=true`; the development override `ALLOW_UNSAFE_MEDIA_FETCHES=true` works only outside production and is for trusted local use. Local file conversion in internal tests does not require the remote network assertion and is not exposed as a room API.

DNS may change between validation and fetching, and redirects may target a different address. `scripts/watchroom-egress.sh` therefore applies a dedicated owner-matched `WATCHROOM_EGRESS` chain to the actual outbound packets from the `watchroom` UID.

| Traffic                                                                            | Policy                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Established/related connections                                                    | Allowed, including replies to inbound viewer requests                      |
| TCP/UDP DNS to the configured resolver on port 53                                  | Allowed                                                                    |
| IPv4 loopback/private/link-local/carrier NAT, unspecified, multicast and broadcast | Dropped                                                                    |
| IPv6 loopback/unspecified, mapped IPv4, link-local, unique-local and multicast     | Dropped                                                                    |
| Other destinations                                                                 | Allowed by this guard; infrastructure egress rules may still restrict them |

The guard uses **DROP**, which avoids requiring the optional IPv6 REJECT kernel extension. Blocked connections can time out rather than fail immediately. It is not a complete public-host allowlist, a bandwidth quota or an authentication system for media hosts.

## Production startup paths

**Docker Compose:** the entrypoint starts as root, discovers the resolver from `/etc/resolv.conf`, applies IPv4 and IPv6 firewall rules, assigns existing data/media files to the service UID, sets the assertion and removes the unsafe override. It then uses `setpriv` to run Node as `watchroom` with no retained capabilities and `no_new_privs`. Compose grants `NET_ADMIN` for the initialization step. Missing capability or failed firewall installation stops startup. Root-only health probes can reach loopback; the app user cannot initiate a new loopback connection.

**Systemd installer:** `watchroom.service` runs as the dedicated user and requires `watchroom-egress.service`. The firewall unit runs first. The service sets the assertion only for this protected deployment. The guard defaults to resolver `127.0.0.53`; configure `DNS_RESOLVER` for hosts using another IPv4 resolver.

Do not set `MEDIA_EGRESS_PROTECTED` manually in an unprotected deployment or remove the required capability simply to silence a startup error. Rootless Docker and managed hosts without network-administration support need a separately reviewed infrastructure policy/startup path. The standard owner-based rules intentionally prevent private-network source URLs, including a database or media server on a private address.

TLS/package signature/checksum verification should remain enabled. Corporate build proxies can provide a trusted CA through the optional BuildKit `build_ca` secret; it is used for package installation and is not baked into the final image. No raw credentials belong in the repository, `.env.example`, image build arguments or saved setup instructions.

## Accounts, rooms and controls

Account passwords use bcrypt; session cookies are HttpOnly and SameSite=Lax, and production HTTPS responses mark them Secure. The database stores a hash of the random session token. The default session duration is 30 days. Logout removes the current session; changing a password revokes other sessions. Socket authentication occurs at connection time: already connected sockets are not immediately revoked by a password change in another browser, so reconnect is required to revalidate them.

Signup/login share an in-memory limit of 10 attempts per IP per 15 minutes; five failed logins for an email trigger an email-based block. Limits reset on process restart and are not coordinated across instances. The server trusts forwarded client-IP/HTTPS headers, so expose it through a trusted reverse proxy that controls those headers. Compose binds the raw application port to loopback by default.

Room passwords are salted scrypt hashes. The UI asks for a 4–100 character password; internal/legacy callers may create a passwordless room, which still requires an account to join. Room owners bypass the room-password check. A previously joined non-owner must still supply the password on a subsequent protected-room join; live reconnect replays the successful join payload from browser memory.

HTTP and socket room lists show only rooms the user owns or has joined. Unauthorized users cannot discover room names/titles through these list APIs; aggregate counts remain public. Host-only mode is enforced on the server for playback, media/audio selection and removing the current movie. Guests can suggest queue entries without automatically selecting the first one. Queue removal otherwise requires ownership of the room or entry. A media-preparation request must refer to the room's current playlist URL.

Socket requests are checked for object payloads; asynchronous failures return acknowledgements/notices instead of unhandled rejections. This is not a replacement for operation-specific input validation or resource controls.

## Scope and current boundaries

- Room passwords protect room controls, chat and joins. **Converted `/media/` assets are served by URL without a membership check.** Their hashed paths are not access-control tokens, and segment responses may be publicly cached. Treat a leaked asset URL as shareable until cache removal; do not use this as private file storage.
- Direct MP4/WebM/HLS URLs are fetched by viewers' browsers. Server-side firewall protection does not apply to browser traffic, media-host authorization or a viewer sharing the original link.
- Anyone who can reach the standard deployment can create an account; there is no admin approval or invite-only registration feature.
- Set `ALLOWED_ORIGINS` to the exact public origin. When unset, the current CORS/Socket.IO origin callbacks allow origins; same-origin-only enforcement is not the default. Origin checks are not authentication.
- SQLite, accounts, sessions and queues persist; presence, rate limits and room clocks are process-local. The documented deployment is one app instance.
- PostgreSQL support is optional code, not part of the validated standard image. The current firewall also blocks private-network database connections from the app UID.
- Video codecs, subtitle decoders and public media hosts remain external inputs. Keep FFmpeg, Node and dependencies updated, and limit access to a trusted group when hosting the standard configuration.

## Verification and reporting

`tests/security.test.js` covers forbidden destinations, mixed public/private DNS answers, protocol checks and fail-closed remote conversion. Room/socket tests cover membership-scoped listings, owner/host restrictions and caught malformed requests. Converter tests use generated local MKV fixtures; a passing suite does not prove that an arbitrary public media host or production DNS path works.

Deployment checks should include a healthy root health probe, non-root/capability inspection, an app-user loopback request that times out, startup failure without `NET_ADMIN`, and a representative source fetched through your actual server network. See [deployment](DEPLOYMENT.md#troubleshooting). Report sensitive security details privately to the repository owner; do not post passwords, session cookies, private source URLs or signing tokens in public issues.
