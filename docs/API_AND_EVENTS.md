# HTTP API and Socket.IO events

This reference describes `server.js`, `routes/` and `src/socketEvents.js`. Send JSON request bodies and use the same-origin `wr_session` cookie; this app has no bearer-token API. Timestamps are epoch milliseconds; playback positions are seconds. Room IDs are eight hexadecimal characters.

## HTTP endpoints

| Method and path              | Request                            | Successful response                                              | Authorization                                    |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `GET /healthz`               | none                               | `200 { status: "ok", service: "watchroom-v3", db: "connected" }` | Public; executes `SELECT 1`                      |
| `GET /api/stats`             | none                               | `200 { totalRooms, liveRooms, viewers }`                         | Public aggregate counts                          |
| `POST /api/auth/signup`      | `{ email, displayName, password }` | `201 { user }`, sets cookie                                      | Public, rate limited                             |
| `POST /api/auth/login`       | `{ email, password }`              | `200 { user }`, sets cookie                                      | Public, rate limited                             |
| `POST /api/auth/logout`      | none                               | `204`, clears cookie and current session                         | Clears cookie even if already unsigned           |
| `GET /api/auth/me`           | none                               | `200 { user }`                                                   | Signed-in session; otherwise `401`               |
| `PATCH /api/account`         | `{ displayName }`                  | `200 { user }`                                                   | Signed in                                        |
| `POST /api/account/password` | `{ currentPassword, newPassword }` | `204`, revokes other sessions                                    | Signed in; verifies current password             |
| `DELETE /api/account`        | `{ password }`                     | `204`, deletes account and owned rooms                           | Signed in; verifies password                     |
| `GET /api/rooms`             | none                               | `200 { rooms: RoomItem[] }`                                      | Rooms owned by or previously joined by this user |
| `PATCH /api/rooms/:id`       | `{ name }`                         | `200 { room: { id, name, ownerId, ownerName } }`                 | Room owner only                                  |
| `DELETE /api/rooms/:id`      | none                               | `204`; connected viewers receive `room:closed`                   | Room owner only                                  |

**Room creation uses `room:create` over Socket.IO. There is no `POST /api/rooms` creation endpoint.** Do not use the old API examples that created rooms over REST.

`user` contains `{ id, email, displayName, createdAt }`, never the password hash or session token. A `RoomItem` from HTTP contains `{ id, name, ownerId, ownerName, playing, itemIndex, memberCount, nowPlaying }`; `nowPlaying` may be `null`. This differs from the socket summary shape below. HTTP `memberCount` counts saved memberships; socket `viewerCount` counts users currently connected to the room.

Account input: email length 5–254, display name length 2–30 with letters/numbers/spaces/`._-`, password length 8–128 and different from the email. Room names are 1–50 characters at the server. Validation errors normally use `400 { error }`; missing authentication uses `401`, owner violations `403`, missing rooms `404`, duplicates `409`, and auth throttling `429`. Login uses the same `401` message for unknown accounts and wrong passwords.

## Socket session and acknowledgements

Connect using Socket.IO with credentials from the signed-in browser. The handshake associates a database session with the socket. The browser recreates its connection when the signed-in user changes and replays its successful join on a network reconnect.

Requests use object payloads. Undefined/null payloads become `{}`; arrays and other payload types are rejected. Actions requiring a current room fail with `Must join a room first` rather than silently dropping the acknowledgement. Asynchronous handler errors are caught and returned through the callback, or through `error:notice` when there is no callback.

```js
const created = await socket.timeout(10000).emitWithAck("room:create", {
  name: "Friday night",
  password: "popcorn",
  hostOnly: true,
});
if (!created.ok) throw new Error(created.error);
const joined = await socket.timeout(10000).emitWithAck("room:join", {
  roomId: created.roomId,
  password: "popcorn",
});
if (!joined.ok) throw new Error(joined.error);
```

Use your own password; the value above is only an example. Generic failures return `{ ok: false, success: false, error }`. Creation/join use `ok` on success; media/queue operations use `success`. Some older rejection paths return only `{ success: false, error }`, so consumers should use the documented success flag for each action.

## Client → server

| Event               | Payload                             | Result/behavior                                                                                                     |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rooms:list`        | `{}`                                | Emits personalized `rooms:list`; unsigned clients receive an empty room list                                        |
| `room:create`       | `{ name, password?, hostOnly? }`    | `{ ok: true, roomId, name }`; requires sign-in; creates without joining                                             |
| `room:join`         | `{ roomId, password? }`             | The `room:joined` payload is emitted and acknowledged; password required for a non-owner in a protected room        |
| `room:leave`        | `{}`                                | Leaves the current live room; persistent membership remains                                                         |
| `room:buffering:update` | `{ buffering: boolean }`            | Reports this viewer's temporary local player buffering state to the room                                           |
| `sync:control`      | `{ action, currentTime?, itemId? }` | `action` is `play`, `pause`, `seek` or `changeItem`; host restriction applies                                       |
| `media:prepare`     | `{ url, audioTrackIndex? }`         | `{ success, error? }`; URL must equal the current playlist item's URL; audio ordinal must be a non-negative integer |
| `playlist:add`      | `{ url, title? }`                   | `{ success: true }` after queue insertion; preparation is separate                                                  |
| `playlist:addBatch` | `{ items: [{ url, title? }] }`      | `{ success: true, count }`; invalid URLs are skipped; all-invalid batches fail                                      |
| `playlist:remove`   | `{ itemId }`                        | `{ success: true }`; owner or adder only, and only host can remove the current movie in a host-only room            |
| `playlist:move`     | `{ itemId, direction: "up" \| "down" }` | Moves one upcoming item by one position; current and earlier queue items cannot be moved                           |
| `playlist:select`   | `{ itemId }`                        | Selects the item via `changeItem`; host restriction applies                                                         |
| `chat:send`         | `{ text }`                          | Nonempty string; truncated to 500 characters; rapid sends within 400 ms are ignored                                 |

Except `rooms:list`, requests require a signed-in socket. Playback, media, queue and chat actions require the socket to have joined a room. Members can reorder upcoming queue items; the selected and earlier items stay fixed. Guests may queue suggestions in a host-only room, but only the owner selects media, controls playback, changes audio or removes the selected movie. The room form requires a 4–100 character password; internal/legacy callers can create passwordless rooms, which still require an account to join.

The browser gives creation, joining and a single queue add 10 seconds for an acknowledgement, and a batch add 30 seconds. Timeouts do not prove that an operation was rolled back; inspect the current queue before retrying a batch.

Playback control denials can arrive as `error:notice` rather than a failed acknowledgement. Wait for `sync:state` to confirm a state change; a generic acknowledgement alone does not prove the movie changed.

## Server → client

| Event                       | Payload                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rooms:list`                | `{ rooms: RoomSummary[], stats: { totalRooms, liveRooms, viewers } }`; room summaries are filtered to the user's memberships |
| `room:joined`               | `{ ok, roomId, name, ownerId, ownerName, isOwner, hostOnly, members, bufferingViewers, playlist, chatHistory, playback }`   |
| `room:members`              | `{ count, names: string[] }` on membership changes                                                                           |
| `room:buffering`            | `[{ id, name, since }]` for viewers whose player is buffering; removed when playback resumes or the socket leaves            |
| `room:closed`               | `{ roomId }` when the room is deleted; affected sockets leave it                                                             |
| `sync:state`                | `PlaybackState`, including source/subtitle/audio metadata and preparation state                                              |
| `media:progress`            | `{ progress, status }`; pending progress is capped at 99, completed conversion sends 100                                     |
| `media:error`               | `{ message }` if the current preparation fails                                                                               |
| `playlist:updated`          | `PlaylistItem[]`                                                                                                             |
| `chat:message` / `chat:msg` | The same `ChatMessage` on both compatibility event names; deduplicate by `id`                                                |
| `error:notice`              | `{ message }`, for example a host-only restriction or bad request                                                            |

`RoomSummary`: `{ id, name, ownerId, ownerName, isLive, viewerCount, currentTitle, createdAt }`.

Initial `members`: `[{ id, name, avatar, isHost }]`. Later presence events contain display names only. The current UI renders local initials rather than requesting third-party avatar URLs. `PlaylistItem`: `{ id, roomId, position, url, title, format, durationSec, addedBy, createdAt }`; duration `0` means unknown. `ChatMessage`: `{ id, sender, text, isSystem, timestamp }`. User chat is persisted; playback controls do not currently create system chat messages.

`PlaybackState`:

```ts
{
  currentItem: PlaylistItem | null;
  currentTime: number;
  isPlaying: boolean;
  updatedAt: number;
  mediaSrc: string | null;
  mediaType: 'direct' | 'hls' | null;
  subtitles: string | null;
  subtitleTracks: { id: string; label: string; language?: string; src: string; default?: boolean }[];
  audioStreams: { index: number; streamIndex: number; codec: string; language: string; title: string }[];
  isPreparing: boolean;
  prepareProgress: number;
  prepareError: string | null;
}
```

For a playing snapshot, calculate `currentTime + (Date.now() - updatedAt) / 1000`. Both values refer to the same snapshot moment. Restored rooms start paused; media preparation freezes the clock, and stale preparation events cannot replace a newer selection. For converted media, `isPreparing` becomes false after the first complete HLS segment is available; `media:progress` can continue until the full conversion and subtitle extraction finish.

## Converted asset delivery

`GET /media/:key/index.m3u8`, segments and WebVTT files are served from the disposable media directory. Playlists use `application/vnd.apple.mpegurl` with no-cache/no-store. Segments use `video/mp2t`; text subtitles use `text/vtt`. These URLs are **not membership-authorized**; hashes are cache identifiers, not authentication. See [security scope](SECURITY.md#scope-and-current-boundaries).
