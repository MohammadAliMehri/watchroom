import crypto from "node:crypto";
import { getRepo } from "../db/repo.js";
import { validateUrl } from "./security.js";
import {
  prepareMedia,
  scheduleJobCleanup,
  touchJob,
  getJobKey,
  isPreparedMediaAvailable,
} from "./converter.js";

export class RoomManager {
  constructor(io, { mediaPreparer = prepareMedia } = {}) {
    this.io = io;
    this.mediaPreparer = mediaPreparer;
    this.rooms = new Map();
    this.playbackDebounceTimers = new Map();
    this.initPromise = this.initFromDb();
  }

  async initFromDb() {
    const repo = await getRepo();
    const dbRooms = await repo.getAllRooms();

    for (const r of dbRooms) {
      const playlist = await repo.listItems(r.id);
      let currentItem = null;
      if (r.itemIndex >= 0 && playlist[r.itemIndex]) {
        currentItem = playlist[r.itemIndex];
      }

      this.rooms.set(r.id, {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        name: r.name,
        passwordHash: r.passwordHash,
        hostOnly: !!r.hostOnly,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        members: new Map(), // userId -> { userId, name, avatar, socketIds: Set<string> }
        playback: {
          currentItem,
          itemIndex: currentItem ? r.itemIndex : -1,
          currentTime: r.positionSec || 0,
          positionAt: r.positionAt || 0,
          isPlaying: false,
          updatedAt: Date.now(),
          mediaSrc: null,
          mediaType: null,
          subtitles: null,
          isPreparing: false,
          prepareProgress: 0,
          prepareError: null,
        },
      });
    }
  }

  debounceSavePlayback(roomId) {
    if (this.playbackDebounceTimers.has(roomId)) {
      return;
    }
    const timer = setTimeout(async () => {
      this.playbackDebounceTimers.delete(roomId);
      const room = this.rooms.get(roomId);
      if (!room) return;
      try {
        const repo = await getRepo();
        await repo.savePlaybackState(roomId, {
          itemIndex: room.playback.itemIndex,
          playing: room.playback.isPlaying,
          positionSec: room.playback.currentTime,
          positionAt: room.playback.updatedAt,
        });
      } catch (err) {
        console.error("Failed to save playback state:", err.message);
      }
    }, 2000);
    this.playbackDebounceTimers.set(roomId, timer);
  }

  async savePlaybackImmediate(roomId) {
    if (this.playbackDebounceTimers.has(roomId)) {
      clearTimeout(this.playbackDebounceTimers.get(roomId));
      this.playbackDebounceTimers.delete(roomId);
    }
    const room = this.rooms.get(roomId);
    if (!room) return;
    try {
      const repo = await getRepo();
      await repo.savePlaybackState(roomId, {
        itemIndex: room.playback.itemIndex,
        playing: room.playback.isPlaying,
        positionSec: room.playback.currentTime,
        positionAt: room.playback.updatedAt,
      });
    } catch (err) {
      console.error("Failed to save playback state immediately:", err.message);
    }
  }

  async getPublicRoomList() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push({
        id,
        name: room.name,
        ownerId: room.ownerId,
        ownerName: room.ownerName,
        isLive: room.playback.isPlaying,
        viewerCount: room.members.size,
        currentTitle: room.playback.currentItem?.title || "No video loaded",
        createdAt: room.createdAt,
      });
    }
    return list;
  }

  getStats() {
    let totalRooms = this.rooms.size;
    let liveRooms = 0;
    let totalViewers = 0;

    for (const room of this.rooms.values()) {
      if (room.playback.isPlaying) liveRooms++;
      totalViewers += room.members.size;
    }

    return { totalRooms, liveRooms, viewers: totalViewers };
  }

  async getRoomListForUser(userId) {
    if (!userId) return [];
    const repo = await getRepo();
    const memberships = new Set(
      (await repo.listRoomsForUser(userId)).map((room) => room.id),
    );
    return (await this.getPublicRoomList()).filter((room) =>
      memberships.has(room.id),
    );
  }

  async broadcastRoomList() {
    const sockets = this.io.sockets?.sockets;
    if (!sockets) return;
    const lists = new Map();
    const stats = this.getStats();
    try {
      await Promise.all(
        [...sockets.values()].map(async (socket) => {
          const userId = socket.data.user?.id;
          if (!lists.has(userId))
            lists.set(userId, this.getRoomListForUser(userId));
          socket.emit("rooms:list", { rooms: await lists.get(userId), stats });
        }),
      );
    } catch {
      console.error("Could not refresh room lists.");
    }
  }

  async createRoom({ name, password, hostOnly = false }, user) {
    if (!user) {
      throw new Error("Sign in required");
    }
    if (!name || name.trim().length === 0 || name.length > 50) {
      throw new Error("Room name must be between 1 and 50 characters.");
    }

    // Spec: Room IDs are 8 hex characters
    const id = crypto.randomBytes(4).toString("hex");
    const repo = await getRepo();

    let passwordHash = "";
    if (password && password.length > 0) {
      // Room password hash using simple scrypt or sha256
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(password, salt, 64).toString("hex");
      passwordHash = `scrypt$${salt}$${hash}`;
    }

    await repo.createRoom({
      id,
      ownerId: user.id,
      name: name.trim(),
      passwordHash,
      hostOnly: !!hostOnly,
    });

    const roomState = {
      id,
      ownerId: user.id,
      ownerName: user.displayName,
      name: name.trim(),
      passwordHash,
      hostOnly: !!hostOnly,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      members: new Map(),
      playback: {
        currentItem: null,
        itemIndex: -1,
        currentTime: 0,
        positionAt: 0,
        isPlaying: false,
        updatedAt: Date.now(),
        mediaSrc: null,
        mediaType: null,
        subtitles: null,
        isPreparing: false,
        prepareProgress: 0,
        prepareError: null,
      },
    };

    this.rooms.set(id, roomState);
    this.broadcastRoomList();
    return { ok: true, roomId: id, name: roomState.name };
  }

  async joinRoom(socket, { roomId, password }) {
    await this.initPromise;
    const user = socket.data.user;
    if (!user) {
      throw new Error("Sign in required");
    }

    const repo = await getRepo();
    let room = this.rooms.get(roomId);
    if (!room) {
      const dbRoom = await repo.getRoom(roomId);
      if (!dbRoom) {
        throw new Error("Room not found");
      }
      // Re-hydrate
      room = {
        id: dbRoom.id,
        ownerId: dbRoom.ownerId,
        ownerName: dbRoom.ownerName,
        name: dbRoom.name,
        passwordHash: dbRoom.passwordHash,
        hostOnly: !!dbRoom.hostOnly,
        createdAt: dbRoom.createdAt,
        updatedAt: dbRoom.updatedAt,
        members: new Map(),
        playback: {
          currentItem: null,
          itemIndex: dbRoom.itemIndex,
          currentTime: dbRoom.positionSec || 0,
          positionAt: dbRoom.positionAt || 0,
          isPlaying: false,
          updatedAt: Date.now(),
          mediaSrc: null,
          mediaType: null,
          subtitles: null,
          isPreparing: false,
          prepareProgress: 0,
          prepareError: null,
        },
      };
      this.rooms.set(roomId, room);
    }

    const isOwner = room.ownerId === user.id;

    // Password verification: owner skips password check
    if (!isOwner && room.passwordHash) {
      if (!password) {
        throw new Error(
          "Wrong password. Ask the room creator for the right one.",
        );
      }
      const [, salt, expectedHex] = room.passwordHash.split("$");
      if (salt && expectedHex) {
        const actual = crypto.scryptSync(password, salt, 64);
        const expected = Buffer.from(expectedHex, "hex");
        if (
          actual.length !== expected.length ||
          !crypto.timingSafeEqual(actual, expected)
        ) {
          throw new Error(
            "Wrong password. Ask the room creator for the right one.",
          );
        }
      } else {
        throw new Error(
          "Wrong password. Ask the room creator for the right one.",
        );
      }
    }

    // Add user to room_members in database
    await repo.addMember(roomId, user.id);

    if (socket.data.roomId && socket.data.roomId !== roomId) {
      this.leaveRoom(socket);
    }

    const memberEntry = room.members.get(user.id) || {
      userId: user.id,
      name: user.displayName,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.displayName)}`,
      socketIds: new Set(),
    };
    memberEntry.socketIds.add(socket.id);
    room.members.set(user.id, memberEntry);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = user.id;
    touchJob(room.playback.mediaKey);
    touchJob(room.preparingMediaKey);

    if (
      room.playback.mediaKey &&
      !isPreparedMediaAvailable(room.playback.mediaKey)
    )
      this.clearPreparedMedia(room);
    const playlist = await repo.listItems(roomId);
    const chatHistory = await repo.listMessages(roomId, 200);

    const snapshotAt = Date.now();
    let effectiveTime = room.playback.currentTime;
    if (room.playback.isPlaying) {
      effectiveTime += (snapshotAt - room.playback.updatedAt) / 1000;
    }

    const ack = {
      ok: true,
      roomId: room.id,
      name: room.name,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      isOwner,
      hostOnly: !!room.hostOnly,
      members: Array.from(room.members.values()).map((m) => ({
        id: m.userId,
        name: m.name,
        avatar: m.avatar,
        isHost: m.userId === room.ownerId,
      })),
      playlist,
      chatHistory: chatHistory.map((c) => ({
        id: c.id,
        sender: c.nick,
        text: c.text,
        isSystem: false,
        timestamp: c.createdAt,
      })),
      playback: {
        ...room.playback,
        currentTime: effectiveTime,
        updatedAt: snapshotAt,
      },
    };

    socket.emit("room:joined", ack);
    this.broadcastMembers(roomId);
    this.broadcastRoomList();
    if (
      room.playback.currentItem &&
      !room.playback.mediaSrc &&
      !room.playback.isPreparing
    ) {
      void this.prepareRoomMedia(roomId, room.playback.currentItem.url);
    }

    return ack;
  }

  async removeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.delete(roomId);

    const timer = this.playbackDebounceTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.playbackDebounceTimers.delete(roomId);
    }
    if (room.playback.mediaKey) {
      this.scheduleUnusedMedia(room.playback.mediaKey);
    }

    this.io.to(roomId).emit("room:closed", { roomId });
    const sockets = await this.io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.data.roomId = null;
      s.leave(roomId);
    }
    this.broadcastRoomList();
  }

  async removeRoomsOwnedBy(userId) {
    const owned = [...this.rooms.values()].filter((r) => r.ownerId === userId);
    for (const room of owned) {
      await this.removeRoom(room.id);
    }
  }

  renameRoom(roomId, name) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.name = name;
    this.broadcastRoomList();
  }

  leaveRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) {
      socket.data.roomId = null;
      socket.leave(roomId);
      return;
    }

    const userId = socket.data.userId;
    if (userId && room.members.has(userId)) {
      const memberEntry = room.members.get(userId);
      memberEntry.socketIds.delete(socket.id);
      if (memberEntry.socketIds.size === 0) {
        room.members.delete(userId);
      }
    }

    socket.leave(roomId);
    socket.data.roomId = null;

    if (room.members.size === 0) {
      if (room.playback.mediaKey) {
        this.scheduleUnusedMedia(room.playback.mediaKey);
      }
    }

    this.broadcastMembers(roomId);
    this.broadcastRoomList();
  }

  broadcastMembers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const names = Array.from(room.members.values()).map((m) => m.name);
    // Spec: room:members: { count, names } where names are display names
    this.io.to(roomId).emit("room:members", {
      count: names.length,
      names,
    });
  }

  broadcastSyncState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const snapshotAt = Date.now();
    let effectiveTime = room.playback.currentTime;
    if (room.playback.isPlaying) {
      effectiveTime += (snapshotAt - room.playback.updatedAt) / 1000;
    }

    this.io.to(roomId).emit("sync:state", {
      currentItem: room.playback.currentItem,
      currentTime: effectiveTime,
      isPlaying: room.playback.isPlaying,
      updatedAt: snapshotAt,
      mediaSrc: room.playback.mediaSrc,
      mediaType: room.playback.mediaType,
      subtitles: room.playback.subtitles,
      subtitleTracks: room.playback.subtitleTracks || [],
      audioStreams: room.playback.audioStreams || [],
      isPreparing: room.playback.isPreparing,
      prepareProgress: room.playback.prepareProgress,
      prepareError: room.playback.prepareError,
    });
  }

  async handleControl(socket, { action, currentTime, itemId }) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = socket.data.user;
    if (!user) return;

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) {
      socket.emit("error:notice", {
        message: "Only room members can control playback.",
      });
      return;
    }

    if (room.hostOnly && user.id !== room.ownerId) {
      socket.emit("error:notice", {
        message: "Only the host can control playback.",
      });
      return;
    }
    if (
      currentTime !== undefined &&
      (!Number.isFinite(currentTime) || currentTime < 0)
    )
      return;

    if (room.playback.isPreparing && action !== "changeItem") {
      socket.emit("error:notice", { message: "The movie is still preparing." });
      return;
    }

    if (action === "play") {
      room.playback.isPlaying = true;
      if (typeof currentTime === "number")
        room.playback.currentTime = currentTime;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
      this.debounceSavePlayback(roomId);
    } else if (action === "pause") {
      if (room.playback.isPlaying) {
        room.playback.currentTime +=
          (Date.now() - room.playback.updatedAt) / 1000;
      }
      room.playback.isPlaying = false;
      if (typeof currentTime === "number")
        room.playback.currentTime = currentTime;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
    } else if (action === "seek") {
      room.playback.currentTime = currentTime || 0;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
    } else if (action === "changeItem") {
      const playlist = await repo.listItems(roomId);
      const targetIndex = playlist.findIndex((p) => p.id === itemId);
      if (targetIndex >= 0) {
        const target = playlist[targetIndex];
        this.clearPreparedMedia(room);
        room.playback.currentItem = target;
        room.playback.itemIndex = targetIndex;
        room.playback.currentTime = 0;
        room.playback.isPlaying = false;
        room.playback.updatedAt = Date.now();
        await this.savePlaybackImmediate(roomId);
        this.prepareRoomMedia(roomId, target.url).catch(() => {});
      }
    }

    this.broadcastSyncState(roomId);
    this.broadcastRoomList();
  }

  scheduleUnusedMedia(key) {
    if (!key) return;
    for (const room of this.rooms.values()) {
      if (
        room.members.size > 0 &&
        (room.playback.mediaKey === key || room.preparingMediaKey === key)
      )
        return;
    }
    scheduleJobCleanup(key);
  }

  clearPreparedMedia(room) {
    const oldKey = room.playback.mediaKey;
    room.preparationToken = null;
    room.preparingMediaKey = null;
    Object.assign(room.playback, {
      mediaSrc: null,
      mediaType: null,
      mediaKey: null,
      subtitles: null,
      subtitleTracks: [],
      audioStreams: [],
      isPreparing: false,
      prepareProgress: 0,
      prepareError: null,
    });
    this.scheduleUnusedMedia(oldKey);
  }

  async prepareRoomMedia(roomId, url, audioTrackIndex = 0, socket = null) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    if (socket) {
      if (!socket.data.user || socket.data.roomId !== roomId)
        throw new Error("Must join a room first");
      if (room.hostOnly && socket.data.user.id !== room.ownerId)
        throw new Error("Only the host can change audio or prepare media.");
      if (url !== room.playback.currentItem?.url)
        throw new Error("Select a playlist item before preparing media.");
    }
    if (!Number.isInteger(audioTrackIndex) || audioTrackIndex < 0)
      throw new Error("Audio track must be a non-negative integer");

    // Freeze the room clock during conversion, then resume from the same position.
    const resumePlaying = room.playback.isPlaying;
    const startedAt = Date.now();
    if (resumePlaying)
      room.playback.currentTime += (startedAt - room.playback.updatedAt) / 1000;
    room.playback.isPlaying = false;
    room.playback.updatedAt = startedAt;
    this.clearPreparedMedia(room);
    const token = Symbol("media preparation");
    room.preparationToken = token;
    room.preparingMediaKey = getJobKey(url, audioTrackIndex);
    room.playback.isPreparing = true;
    const isCurrent = () =>
      this.rooms.get(roomId) === room && room.preparationToken === token;
    const superseded = () => ({
      success: false,
      error: "Media preparation was superseded by a newer selection.",
    });
    this.broadcastSyncState(roomId);
    await this.savePlaybackImmediate(roomId);

    try {
      await validateUrl(url);
      if (!isCurrent()) return superseded();
      const result = await this.mediaPreparer(
        url,
        audioTrackIndex,
        (progressData) => {
          if (!isCurrent()) return;
          room.playback.prepareProgress = progressData.progress;
          this.io.to(roomId).emit("media:progress", {
            progress: progressData.progress,
            status: progressData.status,
          });
        },
      );
      if (!isCurrent()) {
        this.scheduleUnusedMedia(result.key);
        return superseded();
      }
      room.preparingMediaKey = null;
      Object.assign(room.playback, {
        isPreparing: false,
        mediaSrc: result.src,
        mediaType: result.type,
        subtitles: result.subtitles || null,
        subtitleTracks: result.subtitleTracks || [],
        audioStreams: result.audioStreams || [],
        mediaKey: result.key || null,
        prepareProgress: 100,
        prepareError: null,
        isPlaying: resumePlaying,
        updatedAt: Date.now(),
      });
      await this.savePlaybackImmediate(roomId);
      if (!isCurrent()) return superseded();
      this.scheduleUnusedMedia(result.key);
      this.broadcastSyncState(roomId);
      this.broadcastRoomList();
      return { success: true };
    } catch (err) {
      if (!isCurrent()) return superseded();
      room.preparingMediaKey = null;
      room.playback.isPreparing = false;
      room.playback.prepareError = err.message;
      this.broadcastSyncState(roomId);
      this.io.to(roomId).emit("media:error", { message: err.message });
      return { success: false, error: err.message };
    }
  }

  async sendChat(socket, text) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const user = socket.data.user;
    if (!user) return;
    if (typeof text !== "string") throw new Error("Chat text must be a string");
    if (!text.trim()) return;

    // Rate limit: 400ms per socket
    const now = Date.now();
    if (socket.data.lastChatTime && now - socket.data.lastChatTime < 400) {
      return;
    }
    socket.data.lastChatTime = now;

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) return;

    const id = crypto.randomUUID();
    const cleanText = text.trim().substring(0, 500);
    const msg = await repo.addMessage({
      id,
      roomId,
      userId: user.id,
      nick: user.displayName,
      text: cleanText,
    });

    // Spec: Keep Socket.IO event chat:msg or chat:message
    const chatPayload = {
      id: msg.id,
      sender: user.displayName,
      text: msg.text,
      isSystem: false,
      timestamp: msg.createdAt,
    };
    this.io.to(roomId).emit("chat:msg", chatPayload);
    this.io.to(roomId).emit("chat:message", chatPayload);
  }

  async addToPlaylist(roomId, { url, title }, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const user = socket.data.user;
    if (!user) throw new Error("Sign in required");

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) {
      throw new Error("Only room members can add items");
    }

    await validateUrl(url);

    let cleanTitle =
      title?.trim() || new URL(url).pathname.split("/").pop() || "Video file";

    const playlist = await repo.listItems(roomId);
    const id = crypto.randomUUID();
    const item = await repo.addItem({
      id,
      roomId,
      position: playlist.length,
      url,
      title: cleanTitle,
      format: "direct",
      durationSec: 0,
      addedBy: user.id,
    });

    const updated = await repo.listItems(roomId);
    this.io.to(roomId).emit("playlist:updated", updated);

    if (
      !room.playback.currentItem &&
      (!room.hostOnly || room.ownerId === user.id)
    ) {
      room.playback.currentItem = item;
      room.playback.itemIndex = 0;
      room.playback.currentTime = 0;
      room.playback.isPlaying = false;
      await this.savePlaybackImmediate(roomId);
      this.prepareRoomMedia(roomId, item.url).catch(() => {});
    }

    return item;
  }

  async addBatchToPlaylist(roomId, items, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    const user = socket.data.user;
    if (!user) throw new Error("Sign in required");

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) {
      throw new Error("Only room members can add items");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided");
    }

    const playlist = await repo.listItems(roomId);
    let currentPosition = playlist.length;
    const addedItems = [];

    for (const raw of items) {
      if (!raw || !raw.url || !raw.url.trim()) continue;
      const url = raw.url.trim();
      try {
        await validateUrl(url);
      } catch {
        continue;
      }

      let cleanTitle = raw.title?.trim();
      if (!cleanTitle) {
        try {
          const pathname = new URL(url).pathname;
          cleanTitle = decodeURIComponent(
            pathname.split("/").pop() || `Episode ${currentPosition + 1}`,
          );
        } catch {
          cleanTitle = `Episode ${currentPosition + 1}`;
        }
      }

      const id = crypto.randomUUID();
      const item = await repo.addItem({
        id,
        roomId,
        position: currentPosition++,
        url,
        title: cleanTitle,
        format: "direct",
        durationSec: 0,
        addedBy: user.id,
      });
      addedItems.push(item);
    }

    if (addedItems.length === 0) {
      throw new Error("No valid video URLs were found to add");
    }

    const updated = await repo.listItems(roomId);
    this.io.to(roomId).emit("playlist:updated", updated);

    if (
      !room.playback.currentItem &&
      addedItems.length > 0 &&
      (!room.hostOnly || room.ownerId === user.id)
    ) {
      room.playback.currentItem = addedItems[0];
      room.playback.itemIndex = playlist.length;
      room.playback.currentTime = 0;
      room.playback.isPlaying = false;
      await this.savePlaybackImmediate(roomId);
      this.prepareRoomMedia(roomId, addedItems[0].url).catch(() => {});
    }

    return { success: true, count: addedItems.length };
  }

  async removeFromPlaylist(roomId, itemId, socket) {
    const room = this.rooms.get(roomId);
    const user = socket.data.user;
    if (!room || !user || socket.data.roomId !== roomId)
      throw new Error("Must join a room first");
    const repo = await getRepo();
    if (!(await repo.isMember(roomId, user.id)))
      throw new Error("Only room members can remove items");
    const items = await repo.listItems(roomId);
    const target = items.find((item) => item.id === itemId);
    if (!target) throw new Error("Playlist item not found");
    if (room.ownerId !== user.id && target.addedBy !== user.id)
      throw new Error(
        "Only the room owner or who added this item can remove it",
      );
    const removedCurrent = room.playback.currentItem?.id === itemId;
    if (removedCurrent && room.hostOnly && room.ownerId !== user.id)
      throw new Error("Only the host can change the current movie.");

    await repo.removeItem(roomId, itemId);
    const updated = await repo.listItems(roomId);
    if (removedCurrent) {
      const index = Math.min(room.playback.itemIndex, updated.length - 1);
      this.clearPreparedMedia(room);
      Object.assign(room.playback, {
        currentItem: updated[index] || null,
        itemIndex: index,
        currentTime: 0,
        isPlaying: false,
        updatedAt: Date.now(),
      });
    } else {
      room.playback.itemIndex = updated.findIndex(
        (item) => item.id === room.playback.currentItem?.id,
      );
    }
    await this.savePlaybackImmediate(roomId);
    this.io.to(roomId).emit("playlist:updated", updated);
    this.broadcastSyncState(roomId);
    this.broadcastRoomList();
    if (removedCurrent && room.playback.currentItem)
      void this.prepareRoomMedia(roomId, room.playback.currentItem.url);
    return { success: true };
  }
}
