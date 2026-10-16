import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager } from "./src/roomManager.js";
import { registerRoomEvents } from "./src/socketEvents.js";
import { MEDIA_DIR, wipeMediaDir } from "./src/converter.js";
import { initDb, getDb } from "./db/index.js";
import { getRepo } from "./db/repo.js";
import {
  attachUser,
  parseCookies,
  hashToken,
  COOKIE_NAME,
} from "./lib/auth.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/account.js";
import roomsRoutes from "./routes/rooms.js";

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
  return envOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
  },
});

// Clean media directory on start as required in section 3 & 4
wipeMediaDir();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || !allowedOrigins || allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(attachUser);

// Healthcheck endpoint (Section 5 & 12): check SELECT 1 against database
app.get("/healthz", async (req, res) => {
  try {
    const db = await getDb();
    await db.get("SELECT 1");
    res.json({ status: "ok", service: "watchroom-v3", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Mount REST routes
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/rooms", roomsRoutes);

// Room Manager instance
const roomManager = new RoomManager(io);
await roomManager.initPromise;
app.set("roomManager", roomManager);

// Serve HLS media segments and playlists
app.use(
  "/media",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.path.endsWith(".m3u8")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    } else if (req.path.endsWith(".ts")) {
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Content-Type", "video/mp2t");
    } else if (req.path.endsWith(".vtt")) {
      res.setHeader("Content-Type", "text/vtt");
    }
    next();
  },
  express.static(MEDIA_DIR),
  (_req, res) =>
    res.status(404).type("json").json({ error: "Media file not found" }),
);

// Legacy stats route for backwards compatibility
app.get("/api/stats", (req, res) => {
  res.json(roomManager.getStats());
});

// Socket.IO authentication middleware (Section 5.5)
io.use(async (socket, next) => {
  // Origin check if configured
  const handshakeOrigin = socket.handshake.headers.origin;
  if (allowedOrigins && allowedOrigins.length > 0 && handshakeOrigin) {
    if (!allowedOrigins.includes(handshakeOrigin)) {
      return next(new Error("Origin not allowed"));
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

registerRoomEvents(io, roomManager);

// Unknown API paths must not accidentally return the SPA HTML with HTTP 200.
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found" }),
);

// Prefer the current build. Packaged Docker installs use public as a fallback.
const publicDir = path.join(__dirname, "public");
const webDistDir = path.join(__dirname, "web", "dist");

const frontendDir = fs.existsSync(path.join(webDistDir, "index.html"))
  ? webDistDir
  : publicDir;
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.use((req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WatchRoom v3 server listening on http://localhost:${PORT}`);
});

export { app, server, io };
