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

**Acceptance:** Signup, invitation, chat, queue, subtitles, and player controls work at phone widths. Install prompts appear only where supported; offline launch explains that a network connection is required.

### 5. Start MKV playback before the full conversion finishes

**Already in WatchRoom:** FFmpeg converts MKV and other incompatible sources to HLS, extracts supported text subtitles, and reports preparation progress. Playback currently waits for complete conversion.

**Add:** Publish a conversion job only after its first playable HLS segment is complete, then append segments while FFmpeg runs. Track job readiness separately from completion; retain atomic cache metadata and cancellation behavior. Add disk-space and concurrent-job limits before enabling this for public deployments.

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

Phase 1 is implemented with persistent, room-wide reordering of upcoming queue entries. Phases 2–7 remain ordered behind it so playback reliability and clear room controls are in place before streaming and installability changes increase the operational surface.
