import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Dynamically build the server URL from the current browser's hostname.
// This ensures that teammates on WiFi who open http://192.168.x.x:5173
// automatically connect to the socket server at http://192.168.x.x:3001
// instead of trying localhost:3001 on their own machine (which won't work).
const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
  `http://${window.location.hostname}:3001`;

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
