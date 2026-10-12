# WatchRoom v2 API & Events Specification

WatchRoom coordinates state using both HTTP REST endpoints and Socket.IO real-time events.

---

## 1. REST Endpoints

### `GET /healthz`
Health check endpoint used by systemd and reverse proxies.
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "service": "watchroom-v2"
}
```

### `GET /api/stats`
Returns global platform metrics.
- **Response**: `200 OK`
```json
{
  "totalRooms": 5,
  "liveRooms": 2,
  "viewers": 12
}
```

### `GET /api/rooms`
Returns a list of all active rooms.
- **Response**: `200 OK`
```json
[
  {
    "id": "rm_9fa2b3",
    "name": "Movie Night",
    "isLive": true,
    "viewerCount": 4,
    "currentTitle": "Big Buck Bunny",
    "createdAt": 1791783041334
  }
]
```

### `POST /api/rooms`
Creates a new room.
- **Body**:
```json
{
  "name": "SciFi Marathon",
  "password": "secretpassword",
  "hostOnly": true
}
```
- **Response**: `201 Created`
```json
{
  "id": "rm_9fa2b3",
  "name": "SciFi Marathon"
}
```

### `GET /media/:key/*`
Serves HLS segments and playlists.
- `index.m3u8` -> `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: no-cache`
- `seg-*.ts` -> `Content-Type: video/mp2t`, `Cache-Control: public, max-age=31536000`
- `subtitles.vtt` -> `Content-Type: text/vtt`

---

## 2. Socket.IO Events

### Client to Server

| Event | Payload | Description |
|---|---|---|
| `rooms:list` | *(None)* | Requests the current list of available rooms and stats. |
| `room:create` | `{ name, password, hostOnly }` | Creates a new room and emits updated room list. |
| `room:join` | `{ roomId, password, userName }` | Joins a room, authenticates password, and subscribes socket to room updates. |
| `room:leave` | *(None)* | Leaves the current room. |
| `sync:control` | `{ action, currentTime, itemId }` | Sends a playback action: `'play'`, `'pause'`, `'seek'`, or `'changeItem'`. |
| `media:prepare` | `{ url, audioTrackIndex? }` | Requests conversion of a video source to HLS. In host-only rooms, only the host may request media preparation; the acknowledgement returns `{ success, error? }`. |
| `playlist:add` | `{ url, title? }` | Adds a video link to the shared playlist. Guests in host-only rooms do not trigger a server-side metadata probe; duration is populated as `0` until media is prepared. |
| `playlist:remove` | `{ itemId }` | Removes an item from the playlist. |
| `playlist:select` | `{ itemId }` | Selects an item from the playlist for playback. |
| `chat:send` | `{ text }` | Sends a chat message to the room. |

### Server to Client

| Event | Payload | Description |
|---|---|---|
| `rooms:list` | `{ rooms, stats }` | Emitted when room list or global stats update. |
| `room:joined` | `{ roomId, roomName, hostOnly, isHost, members, playlist, chatHistory, playback }` | Initial room state sent upon joining. |
| `room:members` | `Member[]` | Emitted whenever viewers join, leave, or change roles. |
| `sync:state` | `PlaybackState` | Broadcast when video position, play/pause state, or active item changes. |
| `media:progress` | `{ progress, status }` | Conversion progress updates ($0-100\%$). |
| `playlist:updated` | `PlaylistItem[]` | Broadcast whenever the playlist changes. |
| `chat:message` | `ChatMessage` | Broadcast for new chat messages or system action notes. |
| `error:notice` | `{ message }` | Transient notification (e.g., host-only lock notice). |

---

## 3. UI Error Mapping Matrix

As specified in the design guide, internal server messages are mapped to user-friendly copy:

| Server Error String | Displayed Title | Next Step Guidance |
|---|---|---|
| `Cannot read this link as video` | *"We couldn't read this link as a video."* | *"Check that it opens in a browser."* |
| `That address is not allowed` | *"This address can't be used."* | *(None. Do not expose security rule)* |
| `Server is busy converting another movie` | *"The server is busy converting another movie."* | *"Try again in a few minutes."* |
| `Server is busy with other movies` | *"The server is busy with other movies."* | *"Try again in a few minutes."* |
| `Playback error (fatal HLS)` | *"Playback stopped."* | *"Try again" button that reloads the source.* |
| `Room not found` | *"No room with that ID."* | Return back to join form. |
