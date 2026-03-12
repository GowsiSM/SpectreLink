# SpectreLink — Real-Time Chat & Calling App

A real-time web chat application with WebRTC-powered audio and video calling. Users join rooms with a username and room ID to chat and call — no accounts, no setup.

---

## Features

- Real-time messaging via Socket.IO
- Room-based chat with unique username validation per room
- WebRTC audio and video calling with multi-participant support
- Mute, video toggle, and call duration controls
- Incoming call notifications with accept / decline
- Emoji picker for messages
- Live user count and typing indicators
- Auto-cleanup of stale connections

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Socket.IO Client, WebRTC API |
| Backend | Node.js, Express, Socket.IO Server |
| Calling | WebRTC Peer-to-Peer + Google STUN |
| Deployment | Vercel (frontend) · Fly.io (backend) |

---

## Architecture

```
React (Vercel)
      ↓  Socket.IO
Node.js + Socket.IO (Fly.io)
      ↓  WebRTC Signaling
Peer-to-Peer Connection
```

---

## Local Setup

### Prerequisites

- Node.js v14+
- A modern browser with WebRTC support (Chrome, Firefox, Edge, Safari 11+)

### 1. Clone the repository

```bash
git clone https://github.com/GowsiSM/REAL-TIME-CHAT-APPLICATION.git
cd REAL-TIME-CHAT-APPLICATION
```

### 2. Start the backend

```bash
cd server
npm install
node index.js
```

Runs on `http://localhost:3001`

### 3. Start the frontend

```bash
cd frontend
npm install
npm start
```

Runs on `http://localhost:3000`

---

## How to Use

1. Open the app and enter a **username** and **room ID**
2. Share the same room ID with anyone you want to chat with
3. Type messages and press **Enter** or **Send**
4. Click **Audio** or **Video** to start a call when others are in the room
5. Use call controls to mute, toggle video, or end the call
6. Click **Logout** to leave the room

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Server status and active room info |
| `GET /rooms/stats` | Room statistics and user counts |

---

## WebRTC Configuration

Uses Google STUN servers for NAT traversal:

```javascript
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};
```

> For restrictive firewall environments, a TURN server would be needed in production.

---

## Deployment

The live version runs on:

- **Frontend** → [Vercel](https://vercel.com) — deploy the `/frontend` folder
- **Backend** → [Fly.io](https://fly.io) — deploy the `/server` folder (WebSocket-friendly, stays online)

After deploying the backend, update the socket URL in `frontend/src/App.js`:

```javascript
socketRef.current = io("https://your-backend.fly.dev");
```

---

## Browser Support

Chrome 60+ · Firefox 55+ · Safari 11+ · Edge 79+

> HTTPS is required for camera and microphone access in production.
