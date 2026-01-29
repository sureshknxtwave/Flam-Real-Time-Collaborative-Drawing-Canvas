import { useEffect, useRef, useState } from "react";
import { socket } from "../socket/socket";

const ROOM_ID = "default-room";

export default function CanvasBoard() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
 
  const fpsRef = useRef({ last: performance.now(), frames: 0 });
  const drawing = useRef(false);
  const lastCursorEmit = useRef(0);

  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [strokes, setStrokes] = useState([]);
  const [users, setUsers] = useState({});
  const [darkMode, setDarkMode] = useState(false);

  // Tools
  const [color, setColor] = useState("#000000");
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState("brush"); // brush | eraser

  /* ======================= INITIAL SETUP + SOCKETS ======================= */
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    const redraw = (allStrokes) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      allStrokes.forEach(drawFullStroke);
    };

    const onInit = (serverStrokes) => {
      setStrokes(serverStrokes);
      redraw(serverStrokes);
    };

    const onStrokeStart = (stroke) => {
      setStrokes((prev) => [...prev, stroke]);
    };

    const onStrokePoint = ({ strokeId, point }) => {
      setStrokes((prev) => {
        const copy = [...prev];
        const stroke = copy.find((s) => s.id === strokeId);
        if (stroke) {
          stroke.points.push(point);
          drawStrokeSegment(stroke);
        }
        return copy;
      });
    };

    const onCanvasReset = (serverStrokes) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setStrokes(serverStrokes);
      serverStrokes.forEach(drawFullStroke);
    };

    const onUsers = (list) => {
      const map = {};
      list.forEach((u) => (map[u.id] = u));
      setUsers(map);
    };

    const onUserJoined = (user) => {
      setUsers((prev) => ({ ...prev, [user.id]: user }));
    };

    const onUserLeft = (id) => {
      setUsers((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    };

    const onCursorUpdate = (data) => {
      setUsers((prev) => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], ...data },
      }));
    };

    socket.emit("join-room", ROOM_ID);
    socket.on("init", onInit);
    socket.on("stroke-start", onStrokeStart);
    socket.on("stroke-point", onStrokePoint);
    socket.on("canvas-reset", onCanvasReset);
    socket.on("users", onUsers);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("cursor-update", onCursorUpdate);

    return () => {
      socket.off();
    };
  }, []);

  /* ======================= UNDO / REDO / CLEAR LOGIC ======================= */
  const handleUndo = () => {
    socket.emit("undo", { roomId: ROOM_ID });
  };

  const handleRedo = () => {
    socket.emit("redo", { roomId: ROOM_ID });
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear the entire board for everyone?")) {
      socket.emit("clear-canvas", { roomId: ROOM_ID });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey;
      const isRedo = 
        ((e.ctrlKey || e.metaKey) && e.key === "y") || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z");

      if (isUndo) {
        e.preventDefault();
        handleUndo();
      } else if (isRedo) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ======================= PERFORMANCE MONITORING ======================= */
  useEffect(() => {
    let raf;
    const loop = () => {
      const now = performance.now();
      fpsRef.current.frames++;
      if (now - fpsRef.current.last >= 1000) {
        setFps(fpsRef.current.frames);
        fpsRef.current.frames = 0;
        fpsRef.current.last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const start = Date.now();
      socket.emit("ping-check", () => {
        setLatency(Date.now() - start);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /* ======================= DRAW HELPERS ======================= */
  const setupCtxMode = (ctx, toolType, strokeWidth, strokeColor) => {
    if (toolType === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = strokeWidth * 5;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }
  };

  const drawFullStroke = (stroke) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setupCtxMode(ctx, stroke.tool, stroke.width, stroke.color);
    ctx.beginPath();
    stroke.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const drawStrokeSegment = (stroke) => {
    if (!stroke || stroke.points.length < 2) return;
    const ctx = ctxRef.current;
    const pts = stroke.points;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];
    setupCtxMode(ctx, stroke.tool, stroke.width, stroke.color);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  /* ======================= MOUSE EVENTS ======================= */
  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e) => {
    drawing.current = true;
    const { x, y } = getCoords(e);
    const ctx = ctxRef.current;
    setupCtxMode(ctx, tool, width, color);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    socket.emit("draw-start", { roomId: ROOM_ID, x, y, color, width, tool });
  };

  const draw = (e) => {
    const { x, y } = getCoords(e);
    const now = Date.now();
    if (now - lastCursorEmit.current > 30) {
      lastCursorEmit.current = now;
      socket.emit("cursor-move", { roomId: ROOM_ID, x, y });
    }
    if (!drawing.current) return;
    const ctx = ctxRef.current;
    setupCtxMode(ctx, tool, width, color);
    ctx.lineTo(x, y);
    ctx.stroke();
    socket.emit("draw-point", { roomId: ROOM_ID, x, y });
  };

  const stopDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    socket.emit("draw-end", { roomId: ROOM_ID });
  };

  /* ======================= RENDER ======================= */
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: darkMode ? "#1e1e1e" : "#f5f5f5",
        color: darkMode ? "#fff" : "#000",
        overflow: "hidden"
      }}
    >

      {/* Navigation Bar */}
     
      {/* Toolbar */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 20,
          background: darkMode ? "#333" : "#ffffff",
          padding: "10px 12px",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          border: "1px solid #eee",
        }}
      >
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={tool === "eraser"}
          style={{ width: 32, height: 32, padding: 0, border: "none" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min="1"
            max="40"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <span style={{ fontSize: 12, minWidth: "30px" }}>{width}px</span>
        </div>

        <div style={{ display: "flex", gap: 5, borderRight: "1px solid #ddd", paddingRight: 10 }}>
          <button onClick={() => setTool("brush")} style={{ padding: "6px 10px", borderRadius: 6, background: tool === "brush" ? "#007bff" : "#eee", color: tool === "brush" ? "#fff" : "#000", border: "none", cursor: "pointer" }}>Brush</button>
          <button onClick={() => setTool("eraser")} style={{ padding: "6px 10px", borderRadius: 6, background: tool === "eraser" ? "#007bff" : "#eee", color: tool === "eraser" ? "#fff" : "#000", border: "none", cursor: "pointer" }}>Eraser</button>
        </div>

        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={handleUndo} style={{ padding: "6px 10px", borderRadius: 6, background: "#eee", color: "#000", border: "none", cursor: "pointer" }} title="Undo (Ctrl+Z)">⟲ Undo</button>
          <button onClick={handleRedo} style={{ padding: "6px 10px", borderRadius: 6, background: "#eee", color: "#000", border: "none", cursor: "pointer" }} title="Redo (Ctrl+Y)">⟳ Redo</button>
          {/* CLEAR BUTTON ADDED HERE */}
          <button onClick={handleClear} style={{ padding: "6px 10px", borderRadius: 6, background: "#ff4d4d", color: "#fff", border: "none", cursor: "pointer" }} title="Clear Board">🗑 Clear</button>
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{ padding: "6px 10px", borderRadius: 6, background: darkMode ? "#555" : "#ddd", color: darkMode ? "#fff" : "#000", border: "none", cursor: "pointer", marginLeft: 10 }}
        >
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>

      {/* Online Users Panel */}
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 20,
          background: darkMode ? "#333" : "#ffffff",
          padding: "10px",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          fontSize: "12px",
          minWidth: "140px",
          border: "1px solid #eee"
        }}
      >
        <strong>Online Users ({Object.keys(users).length})</strong>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {Object.entries(users).map(([id, user]) => (
            <li key={id} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: user.color || "#ccc",
                  marginRight: 8
                }}
              />
              <span style={{ opacity: id === socket.id ? 0.6 : 1 }}>
                {id === socket.id ? "You" : `User ${id.slice(0, 4)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Canvas Area */}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
        />

        {Object.entries(users).map(([id, user]) => (
          id !== socket.id && (
            <div
              key={id}
              style={{
                position: "absolute",
                left: user.x,
                top: user.y,
                pointerEvents: "none",
                transform: "translate(-50%, -50%)",
                color: user.color || "#ff0000",
                fontSize: 16,
              }}
            >
              ▲
            </div>
          )
        ))}
      </div>

      {/* Performance Stats */}
      <div style={{ position: "fixed", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 10 }}>
        FPS: {fps} | Latency: {latency}ms
      </div>
    </div>
  );
}