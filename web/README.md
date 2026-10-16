# WatchRoom web client

React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4. Radix primitives provide accessible dialogs and form controls; Lucide supplies icons. The cinema artwork, avatars and shared layout styles are local to the app and require no external image service.

## Run from the repository root

```bash
npm ci
npm ci --prefix web
npm start
# In another terminal:
npm run dev --prefix web -- --host 127.0.0.1
```

The Vite development server uses port 5173 and proxies `/api`, `/media` and `/socket.io` to Express on port 3000. Run the backend too: the standalone frontend needs real account/session and room APIs. No development bypass or fake account is built in.

```bash
npm run lint
npm run build:web
npm run smoke
```

The build runs `tsc -b` and writes `web/dist/`. Express prefers that build to legacy `public/` bundles; Docker packages it into the image. Generated output is ignored by Git. `npm run preview --prefix web` serves a static build for inspection; use Express to exercise the complete production API and room workflow.

## Layout and component responsibilities

| Area                                                       | Files                                             |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Application/navigation                                     | `src/App.tsx`, `src/main.tsx`                     |
| Session lifecycle                                          | `src/hooks/useAuth.tsx`                           |
| Socket room state, reconnect and request timeouts          | `src/hooks/useRoom.ts`                            |
| Public landing, cinema artwork and auth shell              | `Landing.tsx`, `MovieNight.tsx`, `AuthLayout.tsx` |
| Room dashboard/loading/search/error states                 | `RoomsScreen.tsx`                                 |
| Invitation, ownership actions and live viewer header       | `RoomHeader.tsx`, `JoinByIdDialog.tsx`            |
| Player/queue/chat layout and theater mode                  | `RoomView.tsx`                                    |
| HTML video, HLS.js, sync, audio and local subtitle options | `Player.tsx`                                      |
| Queue forms, episode selection and batch parsing           | `PlaylistPanel.tsx`                               |
| Chat and reactions                                         | `ChatPanel.tsx`                                   |
| Offline initials                                           | `MemberAvatar.tsx`, `AvatarStack.tsx`             |
| Reusable Radix/Tailwind primitives                         | `src/components/ui/`                              |
| Theme, cinema illustration and responsive styles           | `src/index.css`                                   |

Component filenames above live in `src/components/` unless a full path is shown. `App.tsx` owns the current signed-in navigation and dashboard flow.

## Interaction rules

- Unsigned users see the landing page. Signup/sign-in use real HTTP APIs and update the auth context. The socket connects after authentication and is recreated when the user changes.
- An invitation is `?room=<room-id>`. The ID stays in application state through signup/sign-in, opens the join dialog and is removed from the URL after a successful join. Passwords are not placed in links or persistent browser storage.
- A successful join supplies a full room snapshot. Playback updates, queue changes, chat and preparation progress then arrive on the socket. Duplicate compatibility chat events are deduplicated by message ID.
- Create/join/single-add requests have 10-second acknowledgement timeouts; batch adds have 30 seconds. A timeout can occur after the server has started work, so batch errors ask the user to check the queue before retrying.
- Host-only controls are disabled visually and enforced by the server. Guests may add queue suggestions but the host chooses the active source.
- Subtitle selection, timing, size, uploaded SRT/VTT, volume and fullscreen belong to the viewer. Audio-track changes and playback actions belong to the room.
- `RoomView` is lazy-loaded so the public entry experience does not immediately load the HLS player. Keep a visible Suspense fallback when changing this boundary.
- Loading/empty/error states must remain distinct. Keep controls labeled for keyboard and screen-reader users, respect reduced motion, and verify mobile overflow before shipping layout changes.

## Browser validation

Check the landing page and auth forms at desktop and narrow mobile widths. In two browser sessions: create an account and host-only room, copy its invite, sign up from the invite in the second session, reject a wrong room password, join with the correct one, and verify chat and host restrictions. Add a direct source, change episodes while preparation is pending, remove queued/current entries, and reconnect.

For converted media, test MKV with multiple text subtitle languages and audio streams. Verify caption Off, Unicode text, positive/negative timing adjustments and Reset in the actual browser. Local subtitle uploads stay in one browser; do not label them as shared room uploads.

Backend tests run with `npm test`; type checks/build and lint are separate. The repository does not currently package a Playwright test dependency. Existing browser checks used Chromium externally; they do not replace server tests.

See [watching instructions](../docs/USAGE.md), [API/events](../docs/API_AND_EVENTS.md) and [architecture](../docs/ARCHITECTURE.md).
