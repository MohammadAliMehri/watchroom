/** Register the same Socket.IO contract in production and integration tests. */
export function registerRoomEvents(io, roomManager) {
  io.on("connection", (socket) => {
    const bind = (event, handler, needsRoom = false) => {
      socket.on(event, async (payload, acknowledge) => {
        try {
          if (payload == null) payload = {};
          if (typeof payload !== "object" || Array.isArray(payload))
            throw new Error("Expected an object payload");
          if (event !== "rooms:list" && !socket.data.user)
            throw new Error("Sign in required");
          if (needsRoom && !socket.data.roomId)
            throw new Error("Must join a room first");
          const result = await handler(payload);
          if (typeof acknowledge === "function")
            acknowledge(result || { success: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Request failed";
          if (typeof acknowledge === "function")
            acknowledge({ ok: false, success: false, error: message });
          else socket.emit("error:notice", { message });
        }
      });
    };
    bind("rooms:list", async () => {
      socket.emit("rooms:list", {
        rooms: await roomManager.getRoomListForUser(socket.data.user?.id),
        stats: roomManager.getStats(),
      });
    });
    bind("room:create", (data) =>
      roomManager.createRoom(data, socket.data.user),
    );
    bind("room:join", (data) => roomManager.joinRoom(socket, data));
    bind("room:leave", () => roomManager.leaveRoom(socket));
    bind(
      "sync:control",
      (data) => roomManager.handleControl(socket, data),
      true,
    );
    bind(
      "media:prepare",
      (data) =>
        roomManager.prepareRoomMedia(
          socket.data.roomId,
          data.url,
          data.audioTrackIndex ?? 0,
          socket,
        ),
      true,
    );
    bind(
      "playlist:add",
      async (data) => {
        await roomManager.addToPlaylist(socket.data.roomId, data, socket);
        return { success: true };
      },
      true,
    );
    bind(
      "playlist:addBatch",
      (data) =>
        roomManager.addBatchToPlaylist(socket.data.roomId, data.items, socket),
      true,
    );
    bind(
      "playlist:remove",
      (data) =>
        roomManager.removeFromPlaylist(socket.data.roomId, data.itemId, socket),
      true,
    );
    bind(
      "playlist:move",
      (data) =>
        roomManager.movePlaylistItem(
          socket.data.roomId,
          data.itemId,
          data.direction,
          socket,
        ),
      true,
    );
    bind(
      "playlist:select",
      (data) =>
        roomManager.handleControl(socket, {
          action: "changeItem",
          itemId: data.itemId,
        }),
      true,
    );
    bind("chat:send", (data) => roomManager.sendChat(socket, data.text), true);
    socket.on("disconnect", () => roomManager.leaveRoom(socket));
  });
}
