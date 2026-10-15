import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './src/roomManager.js';
import { MEDIA_DIR, wipeMediaDir } from './src/converter.js';
import { initDb, getDb } from './db/index.js';
import { getRepo } from './db/repo.js';
import { attachUser, parseCookies, hashToken, COOKIE_NAME } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import roomsRoutes from './routes/rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database and run migrations
await initDb();

const app = express();
const server = http.createServer(app);

// Origin validation helper for Socket.IO and CORS
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (!envOrigins) return null; // Default: same origin / all if empty
  return envOrigins.split(',').map(s => s.trim()).filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || !allowedOrigins || allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed'));
    },
    credentials: true
  }
});

// Clean media directory on start as required in section 3 & 4
wipeMediaDir();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins || allowedOrigins.length === 0) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed'));
  },
  credentials: true
}));

app.use(express.json());
app.use(attachUser);

// Healthcheck endpoint (Section 5 & 12): check SELECT 1 against database
app.get('/healthz', async (req, res) => {
  try {
    const db = await getDb();
    await db.get('SELECT 1');
    res.json({ status: 'ok', service: 'watchroom-v3', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Mount REST routes
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/rooms', roomsRoutes);

// Room Manager instance
const roomManager = new RoomManager(io);
app.set('roomManager', roomManager);

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

// Legacy stats route for backwards compatibility
app.get('/api/stats', (req, res) => {
  res.json(roomManager.getStats());
});

// Socket.IO authentication middleware (Section 5.5)
io.use(async (socket, next) => {
  // Origin check if configured
  const handshakeOrigin = socket.handshake.headers.origin;
  if (allowedOrigins && allowedOrigins.length > 0 && handshakeOrigin) {
    if (!allowedOrigins.includes(handshakeOrigin)) {
      return next(new Error('Origin not allowed'));
    }
  }

  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];

    if (token) {
      const tokenHash = hashToken(token);
      const repo = await getRepo();
      const sessionResult = await repo.getSessionUser(tokenHash);
      if (sessionResult) {
        socket.data.user = sessionResult.user;
        socket.data.session = sessionResult.session;
      } else {
        socket.data.user = null;
      }
    } else {
      socket.data.user = null;
    }
    next();
  } catch (err) {
    socket.data.user = null;
    next();
  }
});

// Socket.IO event wiring
io.on('connection', socket => {
  socket.on('rooms:list', async () => {
    const rooms = await roomManager.getPublicRoomList();
    socket.emit('rooms:list', {
      rooms,
      stats: roomManager.getStats()
    });
  });

  socket.on('room:create', async (data, callback) => {
    try {
      if (!socket.data.user) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Sign in required' });
        return;
      }
      const ack = await roomManager.createRoom(data, socket.data.user);
      if (typeof callback === 'function') callback(ack);
    } catch (err) {
      if (typeof callback === 'function') callback({ ok: false, error: err.message });
    }
  });

  socket.on('room:join', async (data, callback) => {
    try {
      if (!socket.data.user) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Sign in required' });
        return;
      }
      const ack = await roomManager.joinRoom(socket, data);
      if (typeof callback === 'function') callback(ack);
    } catch (err) {
      if (typeof callback === 'function') callback({ ok: false, error: err.message });
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
      const result = await roomManager.prepareRoomMedia(roomId, data.url, data.audioTrackIndex || 0, socket);
      if (typeof callback === 'function') callback(result || { success: false, error: 'Room not found' });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('playlist:add', async (data, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      await roomManager.addToPlaylist(roomId, data, socket);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('playlist:addBatch', async (data, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      const result = await roomManager.addBatchToPlaylist(roomId, data.items, socket);
      if (typeof callback === 'function') callback(result);
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  socket.on('playlist:remove', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    roomManager.removeFromPlaylist(roomId, data.itemId, socket);
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

// Vite builds directly into public; web/dist is retained as a legacy fallback.
const publicDir = path.join(__dirname, 'public');
const webDistDir = path.join(__dirname, 'web', 'dist');

const frontendDir = fs.existsSync(publicDir) ? publicDir : webDistDir;
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.use((req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WatchRoom v3 server listening on http://localhost:${PORT}`);
});

export { app, server, io };
