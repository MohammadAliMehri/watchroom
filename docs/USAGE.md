# Plan a movie night

## Create a room and invite your people

1. Open your WatchRoom server and create an account, or sign in.
2. Choose **Create a watch room** and give your room a name and password. For a date night where one person drives the player, enable **Host-only control mode**.
3. Open **Invite friends**, copy the link and send it to your partner or friends. Share the password separately.
4. Your friend signs in or creates an account from the invite, then enters the room password. The room ID is retained through signup; the password is never included in the link.

You can also use **Join by ID**. Existing room members appear in **Your watch rooms**, but non-owner viewers must still provide the room password when joining a password-protected room again. Owners can rejoin their rooms without entering that password.

## Bring a movie or a whole season

Open **Playlist** (or **Open the playlist** in an empty player). Use **Single URL** to add a direct media link and an optional title. In **Batch** mode, put one episode on each line. Supported line formats include:

```text
https://media.example/episode-1.mkv
Episode 2 | https://media.example/episode-2.mkv
Episode 3 - https://media.example/episode-3.mp4
```

The hostname above is an example; replace it with your own reachable media host. A service's movie page, iframe embed, login link or subscription player is not a media URL. WatchRoom has no catalog and does not bypass DRM. Only share media you have permission to stream.

In a shared-control room, the first queued item is selected automatically. In a host-only room, guests can queue suggestions; the host selects what plays. Queueing a link does not wait for an entire video probe or conversion. Invalid or blocked links can fail during preparation. If adding a batch times out, check the playlist before retrying to avoid duplicates.

## MKV, subtitles and audio

MP4, WebM and HLS normally play directly from the media host. MKV and other incompatible containers are converted on the server. H.264 video is copied where possible; other codecs require more CPU. Conversion currently completes before playback begins, so a long movie can spend a while at **Preparing video**.

Use **CC** to select an embedded text subtitle track, change size or adjust timing. Positive timing offsets delay subtitles; negative offsets show them earlier. **Reset** restores original cue times. You can load a local SRT/VTT when a file has no text subtitles. That upload stays in your browser; other viewers choose their own file or track. PGS/DVD image subtitles are not supported.

The Audio menu appears for converted sources with multiple audio streams. Audio changes are shared by the room and may require a new conversion. Everyone pauses at the current position while it prepares, then resumes together if the room was playing. In host-only mode the host chooses the audio.

## Staying together

- Play, pause, seek and episode selections follow the room clock. Volume, subtitle track, subtitle size/timing and fullscreen are local choices.
- Use **Theater Mode** for a wider player. Chat, the queue and viewers are tabs in the regular layout.
- If the browser blocks autoplay, click play or interact with the page. Network buffering can briefly separate viewers; the player corrects large drift when it can play.
- If your connection drops, WatchRoom attempts to rejoin using the last successful room join. If that fails, join again.
- After a server restart, rooms return **paused at their saved position**. The first returning viewer triggers any required preparation. The server does not advance the movie through its downtime.
- Removing the playing episode selects a remaining neighbor, paused at the beginning. Removing the last episode clears the player.

## Chat and room management

Send a message beside the video, or choose a quick emoji. The room retains its latest 200 messages. Messages are limited to 500 characters; rapid messages within 400 ms of the previous message from that socket are ignored.

The room owner can rename or delete the room from its menu. Deleting a room removes everyone from it. Queue entries can be removed by the owner or the person who added them; in host-only rooms only the owner can remove the currently selected movie.

Room lists show rooms you own or previously joined. Room passwords protect access to controls and chat. Converted media URLs themselves are not an access-controlled private storage service; see the [security boundaries](SECURITY.md#scope-and-current-boundaries) before sharing sensitive material.

## Common problems

| Symptom                                        | Next step                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The link opens a website instead of video      | Obtain a direct media URL; webpage URLs are not stream links                                  |
| Direct video works for you but not your friend | Check that their browser can reach the same host, with HTTPS and required CORS                |
| Preparing takes a long time                    | The complete movie must convert first; H.264 MKV and a faster server/source help              |
| No embedded subtitle appears                   | Check whether the source contains text subtitles; use a local SRT/VTT for bitmap-only sources |
| “Wrong password”                               | Ask the host for the room password, which is separate from the invite link                    |
| The server is busy                             | Wait for a conversion slot or a heavy encode to finish                                        |
| Fetch protection / DNS / certificate errors    | Ask the host to follow [deployment troubleshooting](DEPLOYMENT.md#troubleshooting)            |
