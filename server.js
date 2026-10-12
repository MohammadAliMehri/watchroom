import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './src/roomManager.js';
import { MEDIA_DIR, wipeMediaDir } from './src/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Clean media directory on start as required in section 3 & 4
wipeMediaDir();

app.use(cors());
app.use(express.json());

// Healthcheck endpoint (Section 6 & 7)
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'watchroom-v2' });
});

// Serve HLS media segments and playlists
app.use('/media', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.path.endsWith('.m3u8')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  } else if (req.path.endsWith('.ts')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Type', 'video/mp2t');
  } else if (req.path.endsWith('.vtt')) {
    res.setHeader('Content-Type', 'text/vtt');
  }
  next();
}, express.static(MEDIA_DIR));

// Room Manager instance
const roomManager = new RoomManager(io);

// REST API
app.get('/api/stats', (req, res) => {
  res.json(roomManager.getStats());
});

app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getPublicRoomList());
});

app.post('/api/rooms', (req, res) => {
  try {
    const { name, password, hostOnly } = req.body;
    const room = roomManager.createRoom({ name, password, hostOnly });
    res.status(201).json({ id: room.id, name: room.name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.IO event wiring
io.on('connection', socket => {
  // Client requests initial list of rooms
  socket.on('rooms:list', () => {
    socket.emit('rooms:list', {
      rooms: roomManager.getPublicRoomList(),
      stats: roomManager.getStats()
    });
  });

  socket.on('room:create', (data, callback) => {
    try {
      const room = roomManager.createRoom(data);
      if (typeof callback === 'function') callback({ success: true, room: { id: room.id, name: room.name } });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('room:join', (data, callback) => {
    try {
      const member = roomManager.joinRoom(socket, data);
      if (typeof callback === 'function') callback({ success: true, member });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('room:leave', () => {
    roomManager.leaveRoom(socket);
  });

  socket.on('sync:control', (data) => {
    roomManager.handleControl(socket, data);
  });

  socket.on('media:prepare', async (data, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      await roomManager.prepareRoomMedia(roomId, data.url, data.audioTrackIndex || 0);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('playlist:add', async (data, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      await roomManager.addToPlaylist(roomId, data);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('playlist:remove', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    roomManager.removeFromPlaylist(roomId, data.itemId);
  });

  socket.on('playlist:select', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    roomManager.handleControl(socket, { action: 'changeItem', itemId: data.itemId });
  });

  socket.on('chat:send', (data) => {
    roomManager.sendChat(socket, data.text);
  });

  socket.on('disconnect', () => {
    roomManager.leaveRoom(socket);
  });
});

// Serve frontend static build if exists (public directory or web/dist)
const publicDir = path.join(__dirname, 'public');
const webDistDir = path.join(__dirname, 'web', 'dist');

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir));
  app.use((req, res) => {
    res.sendFile(path.join(webDistDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WatchRoom v2 server listening on http://localhost:${PORT}`);
  console.log(`Media directory: ${MEDIA_DIR}`);
});
