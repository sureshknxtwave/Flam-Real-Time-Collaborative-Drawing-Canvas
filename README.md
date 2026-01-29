# Real-Time Collaborative Drawing Canvas

A multi-user real-time drawing application where multiple users can draw simultaneously on a shared canvas with live synchronization, global undo/redo, cursor tracking, and performance monitoring.

## 🚀 Setup Instructions

### Prerequisites
* Node.js ≥ 18
* npm ≥ 9

### Install & Run

```bash
# Clone the repository
git clone https://github.com/sureshknxtwave/Flam-Real-Time-Collaborative-Drawing-Canvas

# Install dependencies
npm install

# Start server + client (Parallel)
npm start


The app will be available at:

Frontend: http://localhost:5173
Socket Server: http://localhost:3000

👥 How to Test with Multiple Users
Open the app in two or more browser tabs.
OR: Open one tab in normal mode and another in incognito.

You should see:

Live drawing across tabs.
Cursor indicators (triangles) for other users.
Global undo/redo affecting all users.
Eraser syncing transparency correctly across tabs.

⚠️ Known Limitations / Bugs
Persistence: Canvas state is in-memory only (refreshing the server clears the board).
Auth: No authentication (users are identified by socket ID).
Touch Optimization: Basic responsive design is implemented, but high-precision stylus pressure is not yet supported.



⏱ Time Spent on the Project

Task	                            Time
Canvas drawing + tools	            ~3 hours
WebSocket sync	                    ~2 hours
Global undo/redo	                ~2 hours
Eraser correctness	                ~1 hours
UI + UX polish	                    ~1 hours
Debugging & edge cases          	~2 hours
Documentation	                    ~0.4 hour
Total	                            ~12 hours