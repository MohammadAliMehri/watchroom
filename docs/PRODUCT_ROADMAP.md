# WatchRoom product roadmap

This roadmap turns the seven product ideas for couples and friends into small releases with observable outcomes. Several foundations already exist, so each phase closes the remaining gap instead of duplicating working behavior.

## Delivery order

### 1. Make the shared queue collaborative

**Already in WatchRoom:** Members can add a movie or paste a season; the queue is shared, persisted, and advances automatically when an episode ends. The host can restrict playback controls.

**Add:** Let members move upcoming items earlier or later. Keep the current item fixed, persist the order, and broadcast it to everyone in the room. A later iteration can add lightweight voting once queue ordering is proven in real rooms.

**Acceptance:** A guest can reorder future items, both clients see the same order, reload preserves it, and neither the current title nor the playback position changes during a reorder.

### 2. Explain synchronization and buffering

**Already in WatchRoom:** Room-clock snapshots, reconnect recovery, drift correction, and play/pause synchronization are implemented.

**Add:** Report each viewer's local buffering and playback readiness to the room. Show a calm, actionable state such as “Waiting for Alex to buffer” and make the host's pause/continue choice clear. Avoid pausing the room for a transient buffer unless the room setting requests it.

**Acceptance:** A slow viewer sees a local buffer state; other viewers see who is waiting; recovery clears the state; disconnect/reconnect does not leave stale indicators.

### 3. Shorten the invite-to-watch path

**Already in WatchRoom:** Invite links retain the room ID through signup, and the room password is shared separately.

**Add:** A focused invite panel with copy/share feedback, clear password guidance, and a single “join and continue” path after signup or login. Never put the room password in a URL.

**Acceptance:** A new account can follow an invite, authenticate, enter the separately shared room password, and reach the room without having to find the invite again. Keyboard and screen-reader labels cover each step.

### 4. Finish the mobile experience and add installation

**Already in WatchRoom:** The room layout adapts to narrow screens, with chat, playlist, and viewer tabs; the player supports touch gestures.

**Add:** Audit touch target sizes, safe-area spacing, orientation changes, and mobile keyboard behavior. Then add a minimal installable PWA shell with a branded manifest and icons. Keep playback online-only; do not cache private media or room data.

**Acceptance:** Signup, invitation, chat, queue, subtitles, and player controls work at phone widths. Install prompts appear only where supported; the app clearly remains online-only and does not cache private room or media data.

### 5. Start MKV playback before the full conversion finishes

**Already in WatchRoom:** FFmpeg converts MKV and other incompatible sources to HLS, extracts supported text subtitles, and reports preparation progress. Playback starts when the first complete HLS segment is published.

**Add:** Harden progressive playback with explicit disk-space limits, bounded in-progress jobs, cancellation, and recovery coverage for interrupted conversions.

**Acceptance:** A representative MKV begins before the full source is converted, seeking remains within published segments, subtitle tracks become available safely, and interrupted/failed jobs clean up without exposing partial playlists as complete media.

### 6. Make audio and subtitle choices easier to understand

**Already in WatchRoom:** Embedded text subtitle tracks and audio tracks are selectable; viewers can tune subtitle size/timing and load a local SRT/VTT file.

**Add:** Present track language and codec consistently, remember per-viewer display preferences, and explain that a local subtitle file is visible only in that viewer's browser. Evaluate bitmap subtitle conversion separately because it increases CPU cost and can require rendering captions into video.

**Acceptance:** Track labels are useful when source metadata is incomplete, a viewer's display preferences survive reload, and local subtitle privacy is explicit. Audio selection remains room-synchronized where host-only control is enabled.

### 7. Make room control and privacy visible

**Already in WatchRoom:** Password-protected rooms, separate invite/password sharing, host-only playback control, and server-side media URL checks are implemented.

**Add:** Put playback permissions and room privacy in a clear room settings panel. Give the owner a visible close-room action and explain what happens to chat, queue, and connected viewers. Document the media-processing path and the fact that converted-media URLs currently rely on unguessable keys rather than room membership checks.

**Acceptance:** Members can tell who controls playback and who can add/select media; owners can close a room with a clear confirmation; privacy copy matches actual storage and media-access behavior.

## Release sequence and verification

Ship one phase at a time. Each phase should include a server-side permission check where a room action changes shared state, a client empty/loading/error state, focused automated coverage, and an update to the usage/API docs. Validate cross-browser behavior with two signed-in accounts before calling a phase complete.

Queue reordering, room-wide buffering notices, first-segment MKV playback, native invite sharing, the install manifest, and per-browser subtitle preferences are implemented. The room header shows host-only controls on mobile and explains room permissions/privacy. Remaining work includes explicit media disk limits and interrupted-job recovery, a full mobile usability audit, and deeper room settings.
