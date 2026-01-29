---

### 📄 `ARCHITECTURE.md`

```markdown
# Architecture Overview

The system uses a centralized real-time state model where all drawing operations are treated as immutable events and synchronized via WebSockets. The server acts as the single source of truth for stroke history, while clients render incrementally for performance.

## 🔄 Data Flow Diagram



1. **User Input:** Local mouse or touch events are captured.
2. **Coordinate Normalization:** Positions are calculated relative to the canvas element to account for responsive headers.
3. **WebSocket Emit:** `draw-start` or `draw-point` is sent to the Node.js server.
4. **Broadcast:** The server updates the `strokes[]` array and broadcasts the event to all other clients in the room.
5. **Incremental Rendering:** Remote clients receive data and draw only the new line segment to maintain high FPS.

## 🔌 WebSocket Protocol

### Client → Server
| Event | Payload |
| :--- | :--- |
| `join-room` | `{ roomId }` |
| `draw-start` | `{ roomId, x, y, color, width, tool }` |
| `draw-point` | `{ roomId, x, y }` |
| `draw-end` | `{ roomId }` |
| `undo` | `{ roomId }` |
| `redo` | `{ roomId }` |
| `clear-canvas`| `{ roomId }` |
| `cursor-move` | `{ roomId, x, y }` |
| `ping-check`  | `callback` |

### Server → Client
| Event | Payload |
| :--- | :--- |
| `init` | `Stroke[]` (Initial state) |
| `stroke-start` | `Stroke` |
| `stroke-point` | `{ strokeId, point }` |
| `canvas-reset` | `Stroke[]` (Full redraw) |
| `users` | `User[]` |
| `user-joined` | `User` |
| `user-left` | `userId` |
| `cursor-update`| `{ userId, x, y }` |

## ↩️ Undo / Redo Strategy (Global)
Undo and Redo are handled globally to ensure every user sees a deterministic state.

* **Server Side:** Maintains an active `strokes` array and a `redoStack`. 
* **Invalidation:** Any new drawing action by any user clears the `redoStack` to prevent state branching.
* **Synchronization:** On undo/redo/clear, the server broadcasts a `canvas-reset`. Clients perform a `ctx.clearRect()` and iterate through the new history.

## ⚡ Performance & Responsiveness
* **Incremental Drawing:** During a stroke, only the latest segment is rendered to avoid $O(n^2)$ redraw overhead.
* **Throttling:** Cursor updates are limited to ~30Hz via timestamp comparison to prevent network congestion.
* **Canvas Resizing:** A ResizeObserver-like effect ensures the canvas internal resolution matches the CSS display size, re-triggering a redraw on window size changes.
* **Touch Support:** `touch-action: none` prevents browser scrolling, allowing seamless mobile drawing.

## ⚔️ Conflict Resolution
* **Simultaneous Drawing:** Strokes are independent objects. The server assigns a UUID to each, ensuring points from different users don't mix.
* **Overlapping Draws:** Uses the standard "Painter's Algorithm" where the latest stroke received by the server is rendered on top.
* **Eraser Conflicts:** Rendered via `globalCompositeOperation = 'destination-out'`. Eraser marks are saved as logical strokes, ensuring they "cut out" existing drawings during a full redraw.