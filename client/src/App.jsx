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
