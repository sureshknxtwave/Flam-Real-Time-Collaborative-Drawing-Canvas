/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket/socket";
import "../App.css";

const ROOM_ID = "default-room";

export default function CanvasBoard() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
 
  // eslint-disable-next-line react-hooks/purity
  const fpsRef = useRef({ last: performance.now(), frames: 0 });
  const drawing = useRef(false);
  const lastCursorEmit = useRef(0);

  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [, setStrokes] = useState([]);
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
      // eslint-disable-next-line react-hooks/immutability
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
    

/**
 * Main Whiteboard Component Wrapper
 * Dynamically switches between 'dark' and 'light' classes based on state.
 */
<div className={`app-container ${darkMode ? "dark" : "light"}`}>
  
  {/* --- 1. SIDEBAR TOOLBAR --- */}
  <div className={`toolbar ${darkMode ? "dark" : "light"}`}>
    
    {/* Brush Customization: Color and Thickness */}
    <div className="control-group">
      <input
        type="color"
        className="color-picker"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        disabled={tool === "eraser"} // Disable color selection when erasing
      />
      <div className="range-container">
        <input
          type="range"
          min="1"
          max="40"
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
        <span style={{ fontSize: 12 }}>{width}px</span>
      </div>
    </div>

    <hr className="divider" />

    {/* Tool Selection: Switch between Brush and Eraser */}
    <div className="button-group">
      <button 
        onClick={() => setTool("brush")} 
        className={`btn ${tool === "brush" ? "btn-primary" : "btn-secondary"}`}
      >
        Brush
      </button>
      <button 
        onClick={() => setTool("eraser")} 
        className={`btn ${tool === "eraser" ? "btn-primary" : "btn-secondary"}`}
      >
        Eraser
      </button>
    </div>

    <hr className="divider" />

    {/* History & Actions: Undo, Redo, and Clear Canvas */}
    <div className="button-group">
      <button onClick={handleUndo} className="btn btn-secondary">⟲ Undo</button>
      <button onClick={handleRedo} className="btn btn-secondary">⟳ Redo</button>
      <button onClick={handleClear} className="btn btn-danger">🗑 Clear</button>
    </div>

    {/* Theme Switcher: Toggles global darkMode state */}
    <button
      onClick={() => setDarkMode(!darkMode)}
      className="btn btn-secondary"
      style={{ background: darkMode ? "#555" : "#ddd", color: darkMode ? "#fff" : "#000" }}
    >
      {darkMode ? "☀️ Light" : "🌙 Dark"}
    </button>
  </div>

  {/* --- 2. COLLABORATION PANEL --- */}
  {/* Shows list of connected users and their assigned stroke colors */}
  <div className={`online-users-panel ${darkMode ? "dark" : "light"}`}>
    <strong>Online Users ({Object.keys(users).length})</strong>
    <ul className="user-list">
      {Object.entries(users).map(([id, user]) => (
        <li key={id} className="user-item">
          {/* Status dot colored by the user's specific pen color */}
          <span className="status-dot" style={{ background: user.color || "#ccc" }} />
          <span style={{ opacity: id === socket.id ? 0.6 : 1 }}>
            {id === socket.id ? "You" : `User ${id.slice(0, 4)}`}
          </span>
        </li>
      ))}
    </ul>
  </div>

  {/* --- 3. DRAWING SURFACE --- */}
  <div style={{ position: "relative", width: "100%", height: "100%" }}>
    {/* Main HTML5 Canvas Element */}
    <canvas 
      ref={canvasRef} 
      onMouseDown={startDraw} 
      onMouseMove={draw} 
      onMouseUp={stopDraw} 
      onMouseLeave={stopDraw} 
    />

    {/* --- 4. REMOTE CURSORS --- */}
    {/* Renders visual pointers for other users in real-time */}
    {Object.entries(users).map(([id, user]) => (
      id !== socket.id && (
        <div 
          key={id} 
          style={{ 
            position: "absolute", 
            left: user.x, 
            top: user.y, 
            pointerEvents: "none", // Prevent cursors from blocking mouse clicks on canvas
            transform: "translate(-50%, -50%)", 
            color: user.color || "#ff0000", 
            fontSize: 16 
          }}
        >
          ▲
        </div>
      )
    ))}
  </div>

  {/* --- 5. PERFORMANCE OVERLAY --- */}
  <div className="stats-bar">
    FPS: {fps} | Latency: {latency}ms
  </div>
</div>
  );
}