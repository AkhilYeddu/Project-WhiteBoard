require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { addUserToRoom, removeUser, getRoom, clearRoom } = require('./rooms');
const { saveStroke, loadStrokes, deleteStroke, clearRoomStrokes } = require('./supabase');

// ── Validate required environment variables at startup ────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌  Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy server/.env.example → server/.env and fill in the values.');
  process.exit(1);
}

const app = express();

// ── CORS ─────────────────────────────────────────────────────
// In production set CLIENT_ORIGIN to your frontend URL(s).
// In development it falls back to allowing all origins.
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : '*';

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  })
);
app.use(express.json());

// ── Health-check endpoint (used by load balancers / uptime monitors) ──
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Serve Frontend in Production ──────────────────────────────
const path = require('path');
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  // Make sure we aren't intercepting API/socket routes
  if (req.path.startsWith('/socket.io') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ── HTTP + Socket.IO server ───────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  // Tune these for production latency / battery life
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Socket event handlers ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a room
  socket.on('join-room', async ({ roomId, userId, userName }) => {
    try {
      socket.join(roomId);
      addUserToRoom(roomId, { socketId: socket.id, userId, userName });

      // Send existing stroke history to the joining user
      const strokes = await loadStrokes(roomId);
      socket.emit('load-history', strokes);

      // Notify others in the room
      socket.to(roomId).emit('user-joined', { userId, userName });

      // Send current user list to everyone in room
      const room = getRoom(roomId);
      io.to(roomId).emit('room-users', room.users);

      console.log(`${userName} joined room ${roomId}`);
    } catch (err) {
      console.error('join-room error:', err);
      socket.emit('error', { message: 'Failed to join room.' });
    }
  });

  // Broadcast a completed stroke to all others + save to Supabase
  socket.on('draw-stroke', async ({ roomId, stroke }) => {
    try {
      socket.to(roomId).emit('stroke-broadcast', stroke);
      await saveStroke(roomId, stroke);
    } catch (err) {
      console.error('draw-stroke error:', err);
    }
  });

  // Broadcast live cursor position (don't save)
  socket.on('cursor-move', ({ roomId, userId, userName, x, y }) => {
    socket.to(roomId).emit('cursor-broadcast', { userId, userName, x, y });
  });

  // Undo: remove last stroke of this user
  socket.on('undo', async ({ roomId, strokeId }) => {
    try {
      socket.to(roomId).emit('undo-broadcast', { strokeId });
      await deleteStroke(strokeId);
    } catch (err) {
      console.error('undo error:', err);
    }
  });

  // Clear entire room canvas
  socket.on('clear-room', async ({ roomId }) => {
    try {
      io.to(roomId).emit('clear-broadcast');
      await clearRoomStrokes(roomId);
    } catch (err) {
      console.error('clear-room error:', err);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const info = removeUser(socket.id);
    if (info) {
      io.to(info.roomId).emit('user-left', { userId: info.userId });
      const room = getRoom(info.roomId);
      if (room) io.to(info.roomId).emit('room-users', room.users);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`\n🚀  Whiteboard server running  [${env}]`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Health:  http://localhost:${PORT}/health\n`);
});

// ── Graceful shutdown ─────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n${signal} received — shutting down gracefully…`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force-kill if it takes too long
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent unhandled promise rejections from crashing the server silently
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
