# 🎨 Shared Whiteboard App — Full Build Prompt

Build a **real-time collaborative whiteboard** where multiple users on the same WiFi can draw together simultaneously in their browser. No internet required — runs entirely on local network.

---

## Tech Stack

- **Frontend**: React + Vite, `socket.io-client`, Canvas API (no fabric.js)
- **Backend**: Node.js + Express + `socket.io`
- **Database**: Supabase (PostgreSQL) — for persisting stroke history per room
- **Styling**: Tailwind CSS

---

## Project Structure

Create this exact folder structure:

```
whiteboard-app/
├── client/                        ← React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas.jsx         ← Main drawing canvas
│   │   │   ├── Toolbar.jsx        ← Tools: pen, eraser, color, size, undo, clear, export
│   │   │   └── UserCursors.jsx    ← Show other users' live cursors with name labels
│   │   ├── hooks/
│   │   │   └── useSocket.js       ← All socket.io logic and event handling
│   │   ├── lib/
│   │   │   └── supabaseClient.js  ← Supabase client init using env vars
│   │   ├── App.jsx                ← Room join screen + whiteboard layout
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env                       ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SERVER_URL
│   ├── vite.config.js
│   └── package.json
│
├── server/
│   ├── index.js                   ← Express + Socket.io server
│   ├── rooms.js                   ← In-memory room + user management
│   ├── supabase.js                ← Supabase admin client, save/load strokes
│   ├── .env                       ← SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT
│   └── package.json
│
└── README.md
```

---

## Supabase Setup

### Run this SQL in Supabase SQL Editor:

```sql
-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Rooms table
create table if not exists rooms (
  id text primary key,
  created_at timestamptz default now()
);

-- Strokes table
create table if not exists strokes (
  id uuid default gen_random_uuid() primary key,
  room_id text references rooms(id) on delete cascade,
  user_id text not null,
  stroke_data jsonb not null,
  -- stroke_data shape:
  -- {
  --   tool: 'pen' | 'eraser',
  --   color: '#hex',
  --   size: number,
  --   points: [{x: number, y: number}]
  -- }
  created_at timestamptz default now()
);

-- Index for fast room loading
create index if not exists idx_strokes_room_id on strokes(room_id);

-- RLS: allow all for now (lock down in production)
alter table rooms enable row level security;
alter table strokes enable row level security;
create policy "allow all" on rooms for all using (true) with check (true);
create policy "allow all" on strokes for all using (true) with check (true);
```

---

## Server — `server/index.js`

```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { addUserToRoom, removeUser, getRoom, clearRoom } = require('./rooms');
const { saveStroke, loadStrokes, deleteStroke, clearRoomStrokes } = require('./supabase');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a room
  socket.on('join-room', async ({ roomId, userId, userName }) => {
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
  });

  // Broadcast a completed stroke to all others + save to Supabase
  socket.on('draw-stroke', async ({ roomId, stroke }) => {
    socket.to(roomId).emit('stroke-broadcast', stroke);
    await saveStroke(roomId, stroke);
  });

  // Broadcast live cursor position (don't save)
  socket.on('cursor-move', ({ roomId, userId, userName, x, y }) => {
    socket.to(roomId).emit('cursor-broadcast', { userId, userName, x, y });
  });

  // Undo: remove last stroke of this user
  socket.on('undo', async ({ roomId, strokeId }) => {
    socket.to(roomId).emit('undo-broadcast', { strokeId });
    await deleteStroke(strokeId);
  });

  // Clear entire room canvas
  socket.on('clear-room', async ({ roomId }) => {
    io.to(roomId).emit('clear-broadcast');
    await clearRoomStrokes(roomId);
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Whiteboard server running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<YOUR_LOCAL_IP>:${PORT}`);
  console.log(`\n   Share your local IP with teammates on same WiFi!\n`);
});
```

---

## Server — `server/rooms.js`

```js
// In-memory room state
const rooms = new Map();

function addUserToRoom(roomId, user) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: [] });
  }
  const room = rooms.get(roomId);
  room.users = room.users.filter(u => u.userId !== user.userId);
  room.users.push(user);
}

function removeUser(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    const idx = room.users.findIndex(u => u.socketId === socketId);
    if (idx !== -1) {
      const [user] = room.users.splice(idx, 1);
      if (room.users.length === 0) rooms.delete(roomId);
      return { roomId, userId: user.userId };
    }
  }
  return null;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function clearRoom(roomId) {
  if (rooms.has(roomId)) rooms.get(roomId).strokes = [];
}

module.exports = { addUserToRoom, removeUser, getRoom, clearRoom };
```

---

## Server — `server/supabase.js`

```js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function saveStroke(roomId, stroke) {
  // Ensure room exists
  await supabase.from('rooms').upsert({ id: roomId }, { onConflict: 'id' });

  const { error } = await supabase.from('strokes').insert({
    id: stroke.id,
    room_id: roomId,
    user_id: stroke.userId,
    stroke_data: stroke
  });
  if (error) console.error('Save stroke error:', error.message);
}

async function loadStrokes(roomId) {
  const { data, error } = await supabase
    .from('strokes')
    .select('stroke_data')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Load strokes error:', error.message); return []; }
  return data.map(row => row.stroke_data);
}

async function deleteStroke(strokeId) {
  const { error } = await supabase.from('strokes').delete().eq('id', strokeId);
  if (error) console.error('Delete stroke error:', error.message);
}

async function clearRoomStrokes(roomId) {
  const { error } = await supabase.from('strokes').delete().eq('room_id', roomId);
  if (error) console.error('Clear room error:', error.message);
}

module.exports = { saveStroke, loadStrokes, deleteStroke, clearRoomStrokes };
```

---

## Server — `server/package.json`

```json
{
  "name": "whiteboard-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

## Server — `server/.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
```

---

## Client — `client/src/hooks/useSocket.js`

```js
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useSocket({ roomId, userId, userName, onStroke, onHistory, onUndo, onClear, onCursorMove, onRoomUsers }) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomId) return;

    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.emit('join-room', { roomId, userId, userName });

    socket.on('load-history', (strokes) => onHistory?.(strokes));
    socket.on('stroke-broadcast', (stroke) => onStroke?.(stroke));
    socket.on('undo-broadcast', ({ strokeId }) => onUndo?.(strokeId));
    socket.on('clear-broadcast', () => onClear?.());
    socket.on('cursor-broadcast', (data) => onCursorMove?.(data));
    socket.on('room-users', (users) => onRoomUsers?.(users));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const emitStroke = useCallback((stroke) => {
    socketRef.current?.emit('draw-stroke', { roomId, stroke });
  }, [roomId]);

  const emitCursor = useCallback((x, y) => {
    socketRef.current?.emit('cursor-move', { roomId, userId, userName, x, y });
  }, [roomId, userId, userName]);

  const emitUndo = useCallback((strokeId) => {
    socketRef.current?.emit('undo', { roomId, strokeId });
  }, [roomId]);

  const emitClear = useCallback(() => {
    socketRef.current?.emit('clear-room', { roomId });
  }, [roomId]);

  return { emitStroke, emitCursor, emitUndo, emitClear };
}
```

---

## Client — `client/src/components/Canvas.jsx`

```jsx
import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const Canvas = forwardRef(({ tool, color, brushSize, onStrokeEnd, onCursorMove }, ref) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokeIdRef = useRef(null);

  useImperativeHandle(ref, () => ({
    drawStroke(stroke) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      renderStroke(ctx, stroke);
    },
    clearCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    },
    undoStroke(strokeId, allStrokes) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      allStrokes.filter(s => s.id !== strokeId).forEach(s => renderStroke(ctx, s));
    },
    exportPNG() {
      const canvas = canvasRef.current;
      const link = document.createElement('a');
      link.download = 'whiteboard.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }));

  function renderStroke(ctx, stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      const mid = {
        x: (stroke.points[i - 1].x + stroke.points[i].x) / 2,
        y: (stroke.points[i - 1].y + stroke.points[i].y) / 2,
      };
      ctx.quadraticCurveTo(stroke.points[i - 1].x, stroke.points[i - 1].y, mid.x, mid.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    strokeIdRef.current = crypto.randomUUID();
    currentStroke.current = [getPos(e)];
  };

  const draw = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    onCursorMove?.(pos.x, pos.y);
    if (!isDrawing.current) return;

    currentStroke.current.push(pos);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pts = currentStroke.current;

    // Draw last segment live
    if (pts.length >= 2) {
      ctx.save();
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const prev = pts[pts.length - 2];
      const curr = pts[pts.length - 1];
      const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
      ctx.moveTo(prev.x, prev.y);
      ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentStroke.current.length > 1) {
      const stroke = {
        id: strokeIdRef.current,
        tool,
        color,
        size: brushSize,
        points: currentStroke.current,
        userId: window.__userId,
        userName: window.__userName,
      };
      onStrokeEnd?.(stroke);
    }
    currentStroke.current = [];
  };

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      canvas.getContext('2d').putImageData(imageData, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full touch-none"
      style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
    />
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;
```

---

## Client — `client/src/components/Toolbar.jsx`

```jsx
const COLORS = ['#1a1a1a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const SIZES = [2, 5, 10, 20, 40];

export default function Toolbar({ tool, setTool, color, setColor, brushSize, setBrushSize, onUndo, onClear, onExport, users }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-b border-gray-200 shadow-sm">
      {/* Tool selector */}
      <div className="flex gap-1">
        <button
          onClick={() => setTool('pen')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tool === 'pen' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >✏️ Pen</button>
        <button
          onClick={() => setTool('eraser')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tool === 'eraser' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >🧹 Eraser</button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Color palette */}
      <div className="flex gap-1">
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('pen'); }}
            style={{ backgroundColor: c, border: color === c ? '2.5px solid #6366f1' : '2px solid #e5e7eb' }}
            className="w-6 h-6 rounded-full transition-transform hover:scale-110 active:scale-95"
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => { setColor(e.target.value); setTool('pen'); }}
          className="w-6 h-6 rounded-full cursor-pointer border-2 border-gray-200 p-0"
          title="Custom color"
        />
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Size</span>
        <input
          type="range"
          min="1"
          max="60"
          value={brushSize}
          onChange={e => setBrushSize(Number(e.target.value))}
          className="w-20 accent-gray-800"
        />
        <span className="text-xs text-gray-500 w-5">{brushSize}</span>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Actions */}
      <button onClick={onUndo} className="px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all">↩ Undo</button>
      <button onClick={onClear} className="px-3 py-1.5 rounded-md text-sm bg-red-50 hover:bg-red-100 text-red-600 transition-all">🗑 Clear</button>
      <button onClick={onExport} className="px-3 py-1.5 rounded-md text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all">💾 Export PNG</button>

      {/* Online users */}
      <div className="ml-auto flex items-center gap-2">
        {users.map(u => (
          <span key={u.userId} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            🟢 {u.userName}
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

## Client — `client/src/components/UserCursors.jsx`

```jsx
export default function UserCursors({ cursors }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Object.entries(cursors).map(([userId, { x, y, userName, color }]) => (
        <div
          key={userId}
          className="absolute transition-all duration-75"
          style={{ left: x, top: y, transform: 'translate(-4px, -4px)' }}
        >
          {/* Cursor dot */}
          <div className="w-3 h-3 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: color }} />
          {/* Name label */}
          <div
            className="absolute top-4 left-2 text-xs text-white px-1.5 py-0.5 rounded-md shadow whitespace-nowrap font-medium"
            style={{ backgroundColor: color }}
          >
            {userName}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Client — `client/src/App.jsx`

```jsx
import { useState, useRef, useCallback } from 'react';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import UserCursors from './components/UserCursors';
import { useSocket } from './hooks/useSocket';

// Assign a random color to each user's cursor
const USER_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
const randomColor = () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
const randomId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export default function App() {
  const [screen, setScreen] = useState('join'); // 'join' | 'board'
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [userId] = useState(() => randomId());
  const [userColor] = useState(() => randomColor());

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1a1a1a');
  const [brushSize, setBrushSize] = useState(4);
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});

  const canvasRef = useRef(null);
  const strokesRef = useRef([]); // local copy of all strokes for undo

  // Expose user info globally for Canvas
  if (typeof window !== 'undefined') {
    window.__userId = userId;
    window.__userName = userName;
  }

  const handleStroke = useCallback((stroke) => {
    strokesRef.current.push(stroke);
    canvasRef.current?.drawStroke(stroke);
  }, []);

  const handleHistory = useCallback((strokes) => {
    strokesRef.current = strokes;
    canvasRef.current?.clearCanvas();
    strokes.forEach(s => canvasRef.current?.drawStroke(s));
  }, []);

  const handleUndo = useCallback((strokeId) => {
    strokesRef.current = strokesRef.current.filter(s => s.id !== strokeId);
    canvasRef.current?.undoStroke(strokeId, strokesRef.current);
  }, []);

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    canvasRef.current?.clearCanvas();
  }, []);

  const handleCursorMove = useCallback(({ userId: uid, userName: uname, x, y }) => {
    setCursors(prev => ({ ...prev, [uid]: { x, y, userName: uname, color: USER_COLORS[uid.charCodeAt(0) % USER_COLORS.length] } }));
  }, []);

  const { emitStroke, emitCursor, emitUndo, emitClear } = useSocket({
    roomId: screen === 'board' ? roomId : null,
    userId,
    userName,
    onStroke: handleStroke,
    onHistory: handleHistory,
    onUndo: handleUndo,
    onClear: handleClear,
    onCursorMove: handleCursorMove,
    onRoomUsers: setUsers,
  });

  const handleLocalStroke = (stroke) => {
    strokesRef.current.push(stroke);
    emitStroke(stroke);
  };

  const handleLocalUndo = () => {
    const myStrokes = strokesRef.current.filter(s => s.userId === userId);
    if (!myStrokes.length) return;
    const last = myStrokes[myStrokes.length - 1];
    emitUndo(last.id);
    handleUndo(last.id);
  };

  const handleLocalClear = () => {
    if (window.confirm('Clear the entire whiteboard for everyone?')) {
      emitClear();
      handleClear();
    }
  };

  // Join screen
  if (screen === 'join') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">🎨 Whiteboard</h1>
          <p className="text-gray-500 text-sm mb-6">Collaborate in real-time on the same WiFi</p>

          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="e.g. Alice"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">Room ID</label>
          <div className="flex gap-2 mb-6">
            <input
              value={roomId}
              onChange={e => setRoomId(e.target.value.toUpperCase())}
              placeholder="e.g. ROOM42"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={() => setRoomId(randomId())}
              className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-medium"
            >
              Random
            </button>
          </div>

          <button
            onClick={() => { if (userName.trim() && roomId.trim()) setScreen('board'); }}
            disabled={!userName.trim() || !roomId.trim()}
            className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white rounded-lg py-2.5 text-sm font-medium transition-all"
          >
            Join Whiteboard →
          </button>

          <p className="text-xs text-gray-400 mt-4 text-center">
            Share the Room ID with others on the same WiFi
          </p>
        </div>
      </div>
    );
  }

  // Whiteboard screen
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 text-white text-sm">
        <span className="font-bold">🎨 Whiteboard</span>
        <span className="bg-gray-700 px-2 py-0.5 rounded font-mono text-xs">{roomId}</span>
        <span className="text-gray-400 text-xs ml-auto">Share this Room ID with teammates on WiFi</span>
        <button
          onClick={() => setScreen('join')}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Leave
        </button>
      </div>

      {/* Toolbar */}
      <Toolbar
        tool={tool} setTool={setTool}
        color={color} setColor={setColor}
        brushSize={brushSize} setBrushSize={setBrushSize}
        onUndo={handleLocalUndo}
        onClear={handleLocalClear}
        onExport={() => canvasRef.current?.exportPNG()}
        users={users}
      />

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden bg-white">
        <Canvas
          ref={canvasRef}
          tool={tool}
          color={color}
          brushSize={brushSize}
          onStrokeEnd={handleLocalStroke}
          onCursorMove={(x, y) => emitCursor(x, y)}
        />
        <UserCursors cursors={cursors} />
      </div>
    </div>
  );
}
```

---

## Client — `client/src/lib/supabaseClient.js`

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

## Client — `client/.env`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SERVER_URL=http://localhost:3001
```

> ⚠️ When testing on same WiFi from other devices, change `VITE_SERVER_URL` to your machine's local IP, e.g. `http://192.168.1.10:3001`

---

## Client — `client/package.json`

```json
{
  "name": "whiteboard-client",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite --host",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.7.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "vite": "^5.0.10"
  }
}
```

---

## Client — `client/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // expose on local network (0.0.0.0)
    port: 5173,
  }
});
```

---

## Client — Tailwind Setup

Create `client/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

Create `client/postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
```

Update `client/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
```

Update `client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Whiteboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## How to Run

### 1. Install & start the server
```bash
cd server
npm install
# Fill in server/.env with your Supabase credentials
npm run dev
```

### 2. Install & start the client
```bash
cd client
npm install
# Fill in client/.env with your Supabase credentials + server URL
npm run dev
```

### 3. Share with teammates on same WiFi
```bash
# Find your local IP
ipconfig    # Windows
ifconfig    # Mac/Linux

# Client will be at: http://YOUR_LOCAL_IP:5173
# Update VITE_SERVER_URL in client/.env to http://YOUR_LOCAL_IP:3001
```

Everyone on the same WiFi opens `http://YOUR_LOCAL_IP:5173`, enters the same Room ID, and draws together in real time! 🎨

---

## Features Summary

| Feature | Status |
|---|---|
| Real-time drawing sync | ✅ Socket.io |
| Persistent stroke history | ✅ Supabase |
| Room-based isolation | ✅ |
| Live cursors with names | ✅ |
| Pen + eraser tools | ✅ |
| Color picker + palette | ✅ |
| Brush size control | ✅ |
| Undo (per user) | ✅ |
| Clear all (for everyone) | ✅ |
| Export as PNG | ✅ |
| Mobile touch support | ✅ |
| Local WiFi (no internet) | ✅ |
