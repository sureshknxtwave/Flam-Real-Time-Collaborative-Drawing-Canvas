const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createRoom } = require("./rooms");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, createRoom(roomId));
    }

    const room = rooms.get(roomId);
    socket.join(roomId);
    room.addUser(socket.id);

    socket.emit("users", room.getUsers());
socket.to(roomId).emit("user-joined", {
  id: socket.id,
  ...room.getUsers().find(u => u.id === socket.id)
});

  });

  socket.on("draw-start", (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    const stroke = room.startStroke(socket.id, data);
    io.to(data.roomId).emit("stroke-start", stroke);
  });

  socket.on("draw-point", (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    const point = room.addPoint(socket.id, data);
    if (point) {
      socket.to(data.roomId).emit("stroke-point", point);
    }
  });

  socket.on("undo", ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const state = room.undo();
  if (state) {
    io.to(roomId).emit("canvas-reset", state);
  }
});

socket.on("redo", ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const state = room.redo();
  if (state) {
    io.to(roomId).emit("canvas-reset", state);
  }
});

socket.on("clear-canvas", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const emptyState = room.clear();
    // Broadcast to everyone in the room that the canvas is now empty
    io.to(roomId).emit("canvas-reset", emptyState);
  });

socket.on("cursor-move", ({ roomId, x, y }) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const data = room.updateCursor(socket.id, x, y);
  if (data) {
    socket.to(roomId).emit("cursor-update", data);
  }
});

socket.on("draw-end", ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;
  room.endStroke(socket.id);
});

socket.on("ping-check", (cb) => {
  cb();
});




  socket.on("disconnect", () => {
   rooms.forEach((room) => {
  room.removeUser(socket.id);
  io.emit("user-left", socket.id);
});
    console.log("Disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
