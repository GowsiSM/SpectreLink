const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Allowed origins for CORS
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,https://spectre-link.vercel.app"
)
  .split(",")
  .map((s) => s.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// In-memory state (ephemeral by design)
let roomUsers = {}; // { roomId: count }
let userRooms = {}; // { socketId: roomId }
let userSockets = {}; // { socketId: { username, room } }
let roomUsernames = {}; // { roomId: Set<username> }
let typingUsers = {}; // { roomId: { username: { socketId, timestamp } } }
let activeCalls = {}; // { roomId: { type, participants, startedBy, startTime } }

// ─── Socket.IO ────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`🟢 User Connected: ${socket.id}`);

  // ── Join Room ──────────────────────────────────────────────────────────────
  socket.on("join_room", ({ room, username }) => {
    try {
      if (!roomUsernames[room]) roomUsernames[room] = new Set();

      if (roomUsernames[room].has(username)) {
        socket.emit("join_error", {
          message:
            "Username already taken in this room. Please choose a different username.",
        });
        console.log(
          `❌ ${username} tried to join room ${room} — username taken`,
        );
        return;
      }

      socket.join(room);
      userRooms[socket.id] = room;
      userSockets[socket.id] = { username, room };
      roomUsernames[room].add(username);

      if (!roomUsers[room]) roomUsers[room] = 0;
      roomUsers[room]++;

      io.to(room).emit("room_data", { userCount: roomUsers[room], room });
      socket.emit("join_success");

      console.log(
        `➕ ${username} joined room ${room} — total users: ${roomUsers[room]}`,
      );
    } catch (error) {
      console.error("❌ Error joining room:", error);
      socket.emit("join_error", {
        message: "Failed to join room. Please try again.",
      });
    }
  });

  // ── Send Message ───────────────────────────────────────────────────────────
  socket.on("send_message", (data) => {
    try {
      const timestamp = new Date();
      const messageId =
        data.messageId ||
        `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Clear typing indicator
      const { room, author: username } = data;
      if (typingUsers[room]?.[username]) {
        delete typingUsers[room][username];
        socket.to(room).emit("user_stopped_typing", { username, room });
      }

      // Broadcast to room (sender already added it locally in Chat.js)
      socket.to(data.room).emit("receive_message", {
        ...data,
        time: timestamp.toISOString(),
        messageId,
      });

      console.log(`💬 [${data.room}] ${data.author}: ${data.message}`);
    } catch (error) {
      console.error("❌ Error processing message:", error);
      socket.emit("message_error", {
        message: "Failed to send message. Please try again.",
      });
    }
  });

  // ── Typing Indicators ──────────────────────────────────────────────────────
  socket.on("typing", ({ room, username }) => {
    if (!typingUsers[room]) typingUsers[room] = {};

    if (!typingUsers[room][username]) {
      typingUsers[room][username] = {
        socketId: socket.id,
        timestamp: Date.now(),
      };
      socket.to(room).emit("user_typing", { username, room });
      console.log(`👀 ${username} is typing in room ${room}`);
    }
  });

  socket.on("stop_typing", ({ room, username }) => {
    if (typingUsers[room]?.[username]) {
      delete typingUsers[room][username];
      socket.to(room).emit("user_stopped_typing", { username, room });
      console.log(`⏹️ ${username} stopped typing in room ${room}`);
    }
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on("start_call", ({ room, callType, caller }) => {
    console.log(`📞 ${caller} starting ${callType} call in room ${room}`);

    if (!activeCalls[room]) {
      activeCalls[room] = {
        type: callType,
        participants: new Set(),
        startedBy: caller,
        startTime: Date.now(),
      };
    }
    activeCalls[room].participants.add(caller);

    socket.to(room).emit("incoming_call", { caller, callType, room });
  });

  socket.on("join_call", ({ room, caller, joiner }) => {
    console.log(`📞 ${joiner} joining call in room ${room}`);
    if (activeCalls[room]) activeCalls[room].participants.add(joiner);
    socket.to(room).emit("call_accepted", { joiner, caller });
  });

  socket.on("offer", ({ room, peerId, offer }) => {
    const senderInfo = userSockets[socket.id];
    console.log(`🤝 Offer from ${senderInfo?.username} to ${peerId}`);

    const targetSocketId = Object.keys(userSockets).find(
      (id) =>
        userSockets[id].username === peerId && userSockets[id].room === room,
    );
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", {
        peerId: senderInfo?.username,
        offer,
      });
    }
  });

  socket.on("answer", ({ room, peerId, answer }) => {
    const senderInfo = userSockets[socket.id];
    console.log(`✅ Answer from ${senderInfo?.username} to ${peerId}`);

    const targetSocketId = Object.keys(userSockets).find(
      (id) =>
        userSockets[id].username === peerId && userSockets[id].room === room,
    );
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", {
        peerId: senderInfo?.username,
        answer,
      });
    }
  });

  socket.on("ice_candidate", ({ room, peerId, candidate }) => {
    const senderInfo = userSockets[socket.id];
    console.log(`🧊 ICE candidate from ${senderInfo?.username} to ${peerId}`);

    const targetSocketId = Object.keys(userSockets).find(
      (id) =>
        userSockets[id].username === peerId && userSockets[id].room === room,
    );
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice_candidate", {
        peerId: senderInfo?.username,
        candidate,
      });
    }
  });

  socket.on("decline_call", ({ room, user }) => {
    console.log(`❌ ${user} declined call in room ${room}`);
    socket.to(room).emit("call_declined", { user, room });
  });

  socket.on("end_call", ({ room, user }) => {
    console.log(`📴 ${user} ended call in room ${room}`);
    _removeCallParticipant(room, user);
    socket.to(room).emit("call_ended", { user, room });
  });

  socket.on("leave_call", ({ room, user }) => {
    console.log(`🚪 ${user} left call in room ${room}`);
    _removeCallParticipant(room, user);
    socket.to(room).emit("user_left_call", { user, room });
  });

  socket.on("media_state_change", ({ room, user, isMuted, isVideoOff }) => {
    console.log(
      `🔊 ${user} media state — muted:${isMuted} videoOff:${isVideoOff}`,
    );
    socket
      .to(room)
      .emit("media_state_changed", { user, room, isMuted, isVideoOff });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const room = userRooms[socket.id];
    const userInfo = userSockets[socket.id];

    console.log(`🔴 User Disconnected: ${socket.id}`);

    if (!room) return;

    roomUsers[room] = Math.max(0, (roomUsers[room] || 1) - 1);

    if (userInfo) {
      const { username } = userInfo;

      roomUsernames[room]?.delete(username);

      // Clean up typing
      if (typingUsers[room]?.[username]) {
        delete typingUsers[room][username];
        socket.to(room).emit("user_stopped_typing", { username, room });
      }

      // Clean up call
      if (activeCalls[room]?.participants.has(username)) {
        _removeCallParticipant(room, username);
        socket.to(room).emit("user_left_call", { user: username, room });
      }

      // Clean up empty room state
      if (roomUsernames[room]?.size === 0) {
        delete roomUsernames[room];
        delete typingUsers[room];
        delete activeCalls[room];
      }

      console.log(
        `➖ ${username} left room ${room} — remaining: ${roomUsers[room]}`,
      );
    }

    io.to(room).emit("room_data", { userCount: roomUsers[room], room });

    delete userRooms[socket.id];
    delete userSockets[socket.id];
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _removeCallParticipant(room, user) {
  if (!activeCalls[room]) return;
  activeCalls[room].participants.delete(user);
  if (activeCalls[room].participants.size === 0) {
    delete activeCalls[room];
    console.log(`🧹 Call cleaned up for room ${room}`);
  }
}

// ─── Stale Typing Cleanup (every 30s) ────────────────────────────────────────

setInterval(() => {
  const TYPING_TIMEOUT = 30000;
  const now = Date.now();

  Object.keys(typingUsers).forEach((room) => {
    Object.keys(typingUsers[room]).forEach((username) => {
      if (now - typingUsers[room][username].timestamp > TYPING_TIMEOUT) {
        delete typingUsers[room][username];
        io.to(room).emit("user_stopped_typing", { username, room });
        console.log(`🧹 Stale typing cleared: ${username} in ${room}`);
      }
    });
    if (Object.keys(typingUsers[room]).length === 0) delete typingUsers[room];
  });
}, 30000);

// ─── REST API ─────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeRooms: Object.keys(roomUsers).length,
    totalUsers: Object.values(roomUsers).reduce((sum, c) => sum + c, 0),
    activeCalls: Object.keys(activeCalls).length,
  });
});

app.get("/rooms/stats", (req, res) => {
  res.json({
    totalRooms: Object.keys(roomUsers).length,
    totalUsers: Object.values(roomUsers).reduce((sum, c) => sum + c, 0),
    activeCalls: Object.keys(activeCalls).length,
    roomDetails: Object.keys(roomUsers).map((room) => ({
      room,
      userCount: roomUsers[room],
      hasActiveCall: !!activeCalls[room],
      callType: activeCalls[room]?.type || null,
    })),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🚀 SpectreLink server running on port ${PORT}`);
  console.log(`📡 WebSocket (Socket.IO) ready`);
  console.log(`📞 WebRTC signaling ready`);
  console.log(`🌐 Health check → http://localhost:${PORT}/health`);
  console.log(`💬 Ephemeral mode — no database, no message persistence`);
});
