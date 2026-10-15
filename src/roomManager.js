import crypto from 'node:crypto';
import { getRepo } from '../db/repo.js';
import { validateUrl } from './security.js';
import { prepareMedia, scheduleJobCleanup, probeSource } from './converter.js';

export class RoomManager {
  constructor(io) {
    this.io = io;
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
      } else if (playlist.length > 0) {
        currentItem = playlist[0];
      }

      this.rooms.set(r.id, {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        name: r.name,
        passwordHash: r.passwordHash,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        members: new Map(), // userId -> { userId, name, avatar, socketIds: Set<string> }
        playback: {
          currentItem,
          itemIndex: r.itemIndex,
          currentTime: r.positionSec || 0,
          positionAt: r.positionAt || 0,
          isPlaying: !!r.playing,
          updatedAt: r.positionAt || Date.now(),
          mediaSrc: null,
          mediaType: null,
          subtitles: null,
          isPreparing: false,
          prepareProgress: 0,
          prepareError: null
        }
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
          positionAt: room.playback.updatedAt
        });
      } catch (err) {
        console.error('Failed to save playback state:', err.message);
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
        positionAt: room.playback.updatedAt
      });
    } catch (err) {
      console.error('Failed to save playback state immediately:', err.message);
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
        currentTitle: room.playback.currentItem?.title || 'No video loaded',
        createdAt: room.createdAt
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

  async broadcastRoomList() {
    const list = await this.getPublicRoomList();
    const stats = this.getStats();
    this.io.emit('rooms:list', { rooms: list, stats });
  }

  async createRoom({ name, password }, user) {
    if (!user) {
      throw new Error('Sign in required');
    }
    if (!name || name.trim().length === 0 || name.length > 50) {
      throw new Error('Room name must be between 1 and 50 characters.');
    }

    // Spec: Room IDs are 8 hex characters
    const id = crypto.randomBytes(4).toString('hex');
    const repo = await getRepo();

    let passwordHash = '';
    if (password && password.length > 0) {
      // Room password hash using simple scrypt or sha256
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      passwordHash = `scrypt$${salt}$${hash}`;
    }

    await repo.createRoom({
      id,
      ownerId: user.id,
      name: name.trim(),
      passwordHash
    });

    const roomState = {
      id,
      ownerId: user.id,
      ownerName: user.displayName,
      name: name.trim(),
      passwordHash,
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
        prepareError: null
      }
    };

    this.rooms.set(id, roomState);
    this.broadcastRoomList();
    return { ok: true, roomId: id, name: roomState.name };
  }

  async joinRoom(socket, { roomId, password }) {
    await this.initPromise;
    const user = socket.data.user;
    if (!user) {
      throw new Error('Sign in required');
    }

    const repo = await getRepo();
    let room = this.rooms.get(roomId);
    if (!room) {
      const dbRoom = await repo.getRoom(roomId);
      if (!dbRoom) {
        throw new Error('Room not found');
      }
      // Re-hydrate
      room = {
        id: dbRoom.id,
        ownerId: dbRoom.ownerId,
        ownerName: dbRoom.ownerName,
        name: dbRoom.name,
        passwordHash: dbRoom.passwordHash,
        createdAt: dbRoom.createdAt,
        updatedAt: dbRoom.updatedAt,
        members: new Map(),
        playback: {
          currentItem: null,
          itemIndex: dbRoom.itemIndex,
          currentTime: dbRoom.positionSec || 0,
          positionAt: dbRoom.positionAt || 0,
          isPlaying: !!dbRoom.playing,
          updatedAt: dbRoom.positionAt || Date.now(),
          mediaSrc: null,
          mediaType: null,
          subtitles: null,
          isPreparing: false,
          prepareProgress: 0,
          prepareError: null
        }
      };
      this.rooms.set(roomId, room);
    }

    const isOwner = room.ownerId === user.id;

    // Password verification: owner skips password check
    if (!isOwner && room.passwordHash) {
      if (!password) {
        throw new Error('Wrong password. Ask the room creator for the right one.');
      }
      const [, salt, expectedHex] = room.passwordHash.split('$');
      if (salt && expectedHex) {
        const actual = crypto.scryptSync(password, salt, 64);
        const expected = Buffer.from(expectedHex, 'hex');
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
          throw new Error('Wrong password. Ask the room creator for the right one.');
        }
      } else {
        throw new Error('Wrong password. Ask the room creator for the right one.');
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
      socketIds: new Set()
    };
    memberEntry.socketIds.add(socket.id);
    room.members.set(user.id, memberEntry);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = user.id;

    const playlist = await repo.listItems(roomId);
    const chatHistory = await repo.listMessages(roomId, 200);

    let effectiveTime = room.playback.currentTime;
    if (room.playback.isPlaying) {
      effectiveTime += (Date.now() - room.playback.updatedAt) / 1000;
    }

    const ack = {
      ok: true,
      roomId: room.id,
      name: room.name,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      isOwner,
      members: Array.from(room.members.values()).map(m => ({
        id: m.userId,
        name: m.name,
        avatar: m.avatar,
        isHost: m.userId === room.ownerId
      })),
      playlist,
      chatHistory: chatHistory.map(c => ({
        id: c.id,
        sender: c.nick,
        text: c.text,
        isSystem: false,
        timestamp: c.createdAt
      })),
      playback: {
        ...room.playback,
        currentTime: effectiveTime
      }
    };

    socket.emit('room:joined', ack);
    this.broadcastMembers(roomId);
    this.broadcastRoomList();

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
      scheduleJobCleanup(room.playback.mediaKey);
    }

    this.io.to(roomId).emit('room:closed', { roomId });
    const sockets = await this.io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.data.roomId = null;
      s.leave(roomId);
    }
    this.broadcastRoomList();
  }

  async removeRoomsOwnedBy(userId) {
    const owned = [...this.rooms.values()].filter(r => r.ownerId === userId);
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
        scheduleJobCleanup(room.playback.mediaKey);
      }
    }

    this.broadcastMembers(roomId);
    this.broadcastRoomList();
  }

  broadcastMembers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const names = Array.from(room.members.values()).map(m => m.name);
    // Spec: room:members: { count, names } where names are display names
    this.io.to(roomId).emit('room:members', {
      count: names.length,
      names
    });
  }

  broadcastSyncState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    let effectiveTime = room.playback.currentTime;
    if (room.playback.isPlaying) {
      effectiveTime += (Date.now() - room.playback.updatedAt) / 1000;
    }

    this.io.to(roomId).emit('sync:state', {
      currentItem: room.playback.currentItem,
      currentTime: effectiveTime,
      isPlaying: room.playback.isPlaying,
      updatedAt: room.playback.updatedAt,
      mediaSrc: room.playback.mediaSrc,
      mediaType: room.playback.mediaType,
      subtitles: room.playback.subtitles,
      subtitleTracks: room.playback.subtitleTracks || [],
      audioStreams: room.playback.audioStreams || [],
      isPreparing: room.playback.isPreparing,
      prepareProgress: room.playback.prepareProgress,
      prepareError: room.playback.prepareError
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
      socket.emit('error:notice', { message: 'Only room members can control playback.' });
      return;
    }

    const formatTimecode = (sec) => {
      const s = Math.floor(sec || 0);
      const m = Math.floor(s / 60);
      const remainderS = s % 60;
      return `${String(m).padStart(2, '0')}:${String(remainderS).padStart(2, '0')}`;
    };

    if (action === 'play') {
      room.playback.isPlaying = true;
      if (typeof currentTime === 'number') room.playback.currentTime = currentTime;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
      this.debounceSavePlayback(roomId);
    } else if (action === 'pause') {
      if (room.playback.isPlaying) {
        room.playback.currentTime += (Date.now() - room.playback.updatedAt) / 1000;
      }
      room.playback.isPlaying = false;
      if (typeof currentTime === 'number') room.playback.currentTime = currentTime;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
    } else if (action === 'seek') {
      room.playback.currentTime = currentTime || 0;
      room.playback.updatedAt = Date.now();
      await this.savePlaybackImmediate(roomId);
    } else if (action === 'changeItem') {
      const playlist = await repo.listItems(roomId);
      const targetIndex = playlist.findIndex(p => p.id === itemId);
      if (targetIndex >= 0) {
        const target = playlist[targetIndex];
        room.playback.currentItem = target;
        room.playback.itemIndex = targetIndex;
        room.playback.currentTime = 0;
        room.playback.isPlaying = false;
        room.playback.updatedAt = Date.now();
        await this.savePlaybackImmediate(roomId);
        this.prepareRoomMedia(roomId, target.url).catch(() => { });
      }
    }

    this.broadcastSyncState(roomId);
    this.broadcastRoomList();
  }

  async prepareRoomMedia(roomId, url, audioTrackIndex = 0, socket = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.playback.isPreparing = true;
    room.playback.prepareProgress = 0;
    room.playback.prepareError = null;
    this.broadcastSyncState(roomId);

    try {
      await validateUrl(url);
      const result = await prepareMedia(url, audioTrackIndex, (progressData) => {
        room.playback.prepareProgress = progressData.progress;
        this.io.to(roomId).emit('media:progress', {
          progress: progressData.progress,
          status: progressData.status
        });
      });

      room.playback.isPreparing = false;
      room.playback.mediaSrc = result.src;
      room.playback.mediaType = result.type;
      room.playback.subtitles = result.subtitles || null;
      room.playback.subtitleTracks = result.subtitleTracks || [];
      room.playback.audioStreams = result.audioStreams || [];
      room.playback.mediaKey = result.key || null;
      room.playback.prepareProgress = 100;
      room.playback.prepareError = null;

      this.broadcastSyncState(roomId);
      return { success: true };
    } catch (err) {
      room.playback.isPreparing = false;
      room.playback.prepareError = err.message;
      this.broadcastSyncState(roomId);
      this.io.to(roomId).emit('media:error', { message: err.message });
      return { success: false, error: err.message };
    }
  }

  async sendChat(socket, text) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const user = socket.data.user;
    if (!user || !text || !text.trim()) return;

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
      text: cleanText
    });

    // Spec: Keep Socket.IO event chat:msg or chat:message
    const chatPayload = {
      id: msg.id,
      sender: user.displayName,
      text: msg.text,
      isSystem: false,
      timestamp: msg.createdAt
    };
    this.io.to(roomId).emit('chat:msg', chatPayload);
    this.io.to(roomId).emit('chat:message', chatPayload);
  }

  async addToPlaylist(roomId, { url, title }, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const user = socket.data.user;
    if (!user) throw new Error('Sign in required');

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) {
      throw new Error('Only room members can add items');
    }

    await validateUrl(url);

    let cleanTitle = title?.trim() || new URL(url).pathname.split('/').pop() || 'Video file';
    let duration = 0;
    try {
      const probe = await probeSource(url);
      duration = probe.duration || 0;
    } catch { }

    const playlist = await repo.listItems(roomId);
    const id = crypto.randomUUID();
    const item = await repo.addItem({
      id,
      roomId,
      position: playlist.length,
      url,
      title: cleanTitle,
      format: 'direct',
      durationSec: duration,
      addedBy: user.id
    });

    const updated = await repo.listItems(roomId);
    this.io.to(roomId).emit('playlist:updated', updated);

    if (!room.playback.currentItem) {
      room.playback.currentItem = item;
      room.playback.itemIndex = 0;
      room.playback.currentTime = 0;
      room.playback.isPlaying = false;
      await this.savePlaybackImmediate(roomId);
      this.prepareRoomMedia(roomId, item.url).catch(() => { });
    }

    return item;
  }

  async addBatchToPlaylist(roomId, items, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    const user = socket.data.user;
    if (!user) throw new Error('Sign in required');

    const repo = await getRepo();
    const isMember = await repo.isMember(roomId, user.id);
    if (!isMember) {
      throw new Error('Only room members can add items');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items provided');
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
          cleanTitle = decodeURIComponent(pathname.split('/').pop() || `Episode ${currentPosition + 1}`);
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
        format: 'direct',
        durationSec: 0,
        addedBy: user.id
      });
      addedItems.push(item);
    }

    if (addedItems.length === 0) {
      throw new Error('No valid video URLs were found to add');
    }

    const updated = await repo.listItems(roomId);
    this.io.to(roomId).emit('playlist:updated', updated);

    if (!room.playback.currentItem && addedItems.length > 0) {
      room.playback.currentItem = addedItems[0];
      room.playback.itemIndex = playlist.length;
      room.playback.currentTime = 0;
      room.playback.isPlaying = false;
      await this.savePlaybackImmediate(roomId);
      this.prepareRoomMedia(roomId, addedItems[0].url).catch(() => { });
    }

    return { success: true, count: addedItems.length };
  }

  async removeFromPlaylist(roomId, itemId, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const user = socket.data.user;
    if (!user) return;

    const repo = await getRepo();
    const items = await repo.listItems(roomId);
    const target = items.find(i => i.id === itemId);
    if (!target) return;

    // Spec: owner or the user who added the item can remove
    if (room.ownerId !== user.id && target.addedBy !== user.id) {
      socket.emit('error:notice', { message: 'Only the room owner or who added this item can remove it' });
      return;
    }

    await repo.removeItem(roomId, itemId);
    const updated = await repo.listItems(roomId);
    this.io.to(roomId).emit('playlist:updated', updated);
  }
}
