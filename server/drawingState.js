const { v4: uuid } = require("uuid");

function createDrawingState() {
  const strokes = [];
  const redoStack = [];
  const active = new Map();

  return {
    startStroke(userId, data) {
      const stroke = {
        id: uuid(),
        userId,
        color: data.color,
        width: data.width,
        tool: data.tool || "brush",
        points: [{ x: data.x, y: data.y }]
      };

      active.set(userId, stroke);
      strokes.push(stroke);
      redoStack.length = 0; // New action invalidates redo
      return stroke;
    },

    addPoint(userId, data) {
      const stroke = active.get(userId);
      if (!stroke) return null;
      const point = { x: data.x, y: data.y };
      stroke.points.push(point);
      return { strokeId: stroke.id, point };
    },

    endStroke(userId) {
      active.delete(userId);
    },

    undo() {
      if (strokes.length === 0) return null;
      const removed = strokes.pop();
      redoStack.push(removed);
      active.clear();
      return strokes;
    },

    redo() {
      if (redoStack.length === 0) return null;
      const restored = redoStack.pop();
      strokes.push(restored);
      return strokes;
    },

    // --- ADD THIS METHOD ---
    clear() {
      strokes.length = 0;
      redoStack.length = 0;
      active.clear();
      return []; // Return empty state
    },

    getState() {
      return strokes;
    }
  };
}

module.exports = { createDrawingState };