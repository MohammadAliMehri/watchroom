import crypto from 'node:crypto';
import { DB } from './db.js';
import { validateUrl } from './security.js';
import { prepareMedia, scheduleJobCleanup, touchJob, probeSource } from './converter.js';

export class RoomManager {
  constructor(io) {
    this.io = io;
    // Map of roomId -> live state
    this.rooms = new Map();
    // Load persisted rooms into memory
    this.initFromDb();
  }

  initFromDb() {
    const dbRooms = DB.getRooms();
    for (const r of dbRooms) {
      const playlist = DB.getPlaylist(r.id);
      const firstItem = playlist[0] || null;

      this.rooms.set(r.id, {
        id: r.id,
        name: r.name,
        password: r.password,
        hostOnly: !!r.host_only,
        createdAt: r.created_at,
        hostSocketId: null,
        members: new Map(), // socketId -> { id, name, avatar, isHost }
        playback: {
          currentItem: firstItem,
          currentTime: 0,
          isPlaying: false,
          updatedAt: Date.now(),
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

  getPublicRoomList() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push({
        id,
        name: room.name,
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

  broadcastRoomList() {
    const list = this.getPublicRoomList();
    const stats = this.getStats();
    this.io.emit('rooms:list', { rooms: list, stats });
  }

  createRoom({ name, password, hostOnly = false }) {
    if (!name || name.trim().length === 0 || name.length > 40) {
      throw new Error('Room name must be between 1 and 40 characters.');
    }
    if (!password || password.length < 4 || password.length > 100) {
      throw new Error('Password needs at least 4 characters.');
    }

    const id = 'rm_' + crypto.randomBytes(4).toString('hex');
    DB.createRoom({ id, name: name.trim(), password, hostOnly });

    const roomState = {
      id,
      name: name.trim(),
      password,
      hostOnly: !!hostOnly,
      createdAt: Date.now(),
      hostSocketId: null,
      members: new Map(),
      playback: {
        currentItem: null,
        currentTime: 0,
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
    return roomState;
  }

  joinRoom(socket, { roomId, password, userName }) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.password && room.password !== password) {
      throw new Error('Wrong password. Ask the room creator for the right one.');
    }

    const isFirstMember = room.members.size === 0;
    const isHost = isFirstMember || (!room.hostSocketId);
    if (isHost) {
      room.hostSocketId = socket.id;
    }

    const cleanName = (userName && userName.trim()) || `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`;

    const member = {
      id: socket.id,
      name: cleanName,
      avatar,
      isHost
    };

    room.members.set(socket.id, member);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.member = member;

    // Send initial room snapshot to newly joined user
    const playlist = DB.getPlaylist(roomId);
    const chatHistory = DB.getChatHistory(roomId, 100);

    // Calculate current effective playback time
    let effectiveTime = room.playback.currentTime;
    if (room.playback.isPlaying) {
      const elapsedSec = (Date.now() - room.playback.updatedAt) / 1000;
      effectiveTime += elapsedSec;
    }

    socket.emit('room:joined', {
      roomId: room.id,
      roomName: room.name,
      hostOnly: room.hostOnly,
      isHost,
      members: Array.from(room.members.values()),
      playlist,
      chatHistory,
      playback: {
        ...room.playback,
        currentTime: effectiveTime
      }
    });

    // Notify room members
    this.broadcastMembers(roomId);
    this.broadcastRoomList();

    return member;
  }

  leaveRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.members.delete(socket.id);
    socket.leave(roomId);
    socket.data.roomId = null;

    // Elect new host if previous host left
    if (room.hostSocketId === socket.id) {
      const nextMember = room.members.values().next().value;
      if (nextMember) {
        room.hostSocketId = nextMember.id;
        nextMember.isHost = true;
      } else {
        room.hostSocketId = null;
        // If no viewers, schedule media cleanup for current video
        if (room.playback.mediaKey) {
          scheduleJobCleanup(room.playback.mediaKey);
        }
      }
    }

    this.broadcastMembers(roomId);
    this.broadcastRoomList();
  }

  broadcastMembers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const members = Array.from(room.members.values());
    this.io.to(roomId).emit('room:members', members);
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
      isPreparing: room.playback.isPreparing,
      prepareProgress: room.playback.prepareProgress,
      prepareError: room.playback.prepareError,
      hostId: room.hostSocketId
    });
  }

  handleControl(socket, { action, currentTime, itemId }) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const member = socket.data.member;
    if (room.hostOnly && socket.id !== room.hostSocketId) {
      socket.emit('error:notice', { message: 'Only the host can control playback.' });
      return;
    }

    const userName = member ? member.name : 'Someone';
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
      this.addSystemChat(roomId, `${userName} played at ${formatTimecode(room.playback.currentTime)}`);
    } else if (action === 'pause') {
      if (room.playback.isPlaying) {
        room.playback.currentTime += (Date.now() - room.playback.updatedAt) / 1000;
      }
      room.playback.isPlaying = false;
      if (typeof currentTime === 'number') room.playback.currentTime = currentTime;
      room.playback.updatedAt = Date.now();
      this.addSystemChat(roomId, `${userName} paused at ${formatTimecode(room.playback.currentTime)}`);
    } else if (action === 'seek') {
      room.playback.currentTime = currentTime || 0;
      room.playback.updatedAt = Date.now();
      this.addSystemChat(roomId, `${userName} jumped to ${formatTimecode(room.playback.currentTime)}`);
    } else if (action === 'changeItem') {
      const playlist = DB.getPlaylist(roomId);
      const target = playlist.find(p => p.id === itemId);
      if (target) {
        room.playback.currentItem = target;
        room.playback.currentTime = 0;
        room.playback.isPlaying = false;
        room.playback.updatedAt = Date.now();
        this.addSystemChat(roomId, `${userName} changed item to "${target.title}"`);
        this.prepareRoomMedia(roomId, target.url);
      }
    }

    this.broadcastSyncState(roomId);
    this.broadcastRoomList();
  }

  async prepareRoomMedia(roomId, url, audioTrackIndex = 0) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.playback.isPreparing = true;
    room.playback.prepareProgress = 0;
    room.playback.prepareError = null;
    this.broadcastSyncState(roomId);

    try {
      // 1. Validate URL against SSRF
      await validateUrl(url);

      // 2. Prepare media via converter pipeline
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
      room.playback.mediaKey = result.key || null;
      room.playback.prepareProgress = 100;
      room.playback.prepareError = null;

      this.broadcastSyncState(roomId);
    } catch (err) {
      room.playback.isPreparing = false;
      room.playback.prepareError = err.message;
      this.broadcastSyncState(roomId);
      this.io.to(roomId).emit('media:error', { message: err.message });
    }
  }

  addSystemChat(roomId, text) {
    const id = 'msg_' + crypto.randomBytes(4).toString('hex');
    const msg = DB.addChatMessage({
      id,
      roomId,
      sender: 'System',
      text,
      isSystem: true,
      timestamp: Date.now()
    });
    this.io.to(roomId).emit('chat:message', msg);
  }

  sendChat(socket, text) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const member = socket.data.member;
    const sender = member ? member.name : 'Guest';

    if (!text || !text.trim()) return;

    const id = 'msg_' + crypto.randomBytes(4).toString('hex');
    const msg = DB.addChatMessage({
      id,
      roomId,
      sender,
      text: text.trim().substring(0, 500),
      isSystem: false,
      timestamp: Date.now()
    });

    this.io.to(roomId).emit('chat:message', msg);
  }

  async addToPlaylist(roomId, { url, title }) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Validate URL
    await validateUrl(url);

    // Auto-probe title and duration if needed
    let cleanTitle = title?.trim();
    let duration = 0;
    try {
      const probe = await probeSource(url);
      duration = probe.duration || 0;
      if (!cleanTitle) {
        cleanTitle = url.split('/').pop()?.split('?')[0] || 'Video file';
      }
    } catch {
      if (!cleanTitle) cleanTitle = url.split('/').pop()?.split('?')[0] || 'Video file';
    }

    const playlist = DB.getPlaylist(roomId);
    const id = 'pl_' + crypto.randomBytes(4).toString('hex');
    const item = DB.addPlaylistItem({
      id,
      roomId,
      url,
      title: cleanTitle,
      duration,
      position: playlist.length
    });

    const updated = DB.getPlaylist(roomId);
    this.io.to(roomId).emit('playlist:updated', updated);

    // If room has no active item, auto-select this one
    if (!room.playback.currentItem) {
      room.playback.currentItem = item;
      room.playback.currentTime = 0;
      room.playback.isPlaying = false;
      this.prepareRoomMedia(roomId, item.url);
    }
  }

  removeFromPlaylist(roomId, itemId) {
    DB.removePlaylistItem(roomId, itemId);
    const updated = DB.getPlaylist(roomId);
    this.io.to(roomId).emit('playlist:updated', updated);
  }
}
