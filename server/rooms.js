const { createDrawingState } = require("./drawingState");

function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
}

function createRoom(id) {
  const users = new Map(); // socketId -> { color, x, y }
  const drawing = createDrawingState();

  return {
    addUser(userId) {
      users.set(userId, {
        color: randomColor(),
        x: 0,
        y: 0
      });
    },

    removeUser(userId) {
      users.delete(userId);
    },

    updateCursor(userId, x, y) {
      const user = users.get(userId);
      if (!user) return null;
      user.x = x;
      user.y = y;
      return { userId, ...user };
    },

    getUsers() {
      return Array.from(users.entries()).map(([id, data]) => ({
        id,
        ...data
      }));
    },

    // drawing passthrough
    getState: drawing.getState,
    startStroke: drawing.startStroke,
    addPoint: drawing.addPoint,
    endStroke: drawing.endStroke,
    undo: drawing.undo,
    redo: drawing.redo,
    clear: drawing.clear
  };
}

module.exports = { createRoom };
