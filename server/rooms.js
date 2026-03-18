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
