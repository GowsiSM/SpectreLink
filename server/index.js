// server/index.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// --- WebSocket (Chat logic) ---
const io = new Server(server, {
  cors: {
    origin:"http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let roomUsers = {}; // Track user count per room
let userRooms = {}; // Track which room each socket is in
let userSockets = {}; // Track socket info per user
let roomUsernames = {}; // Track usernames per room to prevent duplicates
let typingUsers = {}; // Track typing users per room
let activeCalls = {}; // Track active calls per room

io.on("connection", (socket) => {
  console.log(`🟢 User Connected: ${socket.id}`);

  socket.on("join_room", ({ room, username }) => {
    // Initialize room data if it doesn't exist
    if (!roomUsernames[room]) {
      roomUsernames[room] = new Set();
    }
    
    // Check if username already exists in the room
    if (roomUsernames[room].has(username)) {
      socket.emit("join_error", { 
        message: "Username already taken in this room. Please choose a different username." 
      });
      console.log(`❌ ${username} tried to join room ${room} but username is already taken`);
      return;
    }

    socket.join(room);
    userRooms[socket.id] = room;
    userSockets[socket.id] = { username, room };
    
    // Add username to room's username set
    roomUsernames[room].add(username);
    
    console.log(`➕ ${username} (${socket.id}) joined room: ${room}`);

    // Update room user count
    if (!roomUsers[room]) roomUsers[room] = 0;
    roomUsers[room]++;

    // Emit updated user count to all users in the room
    io.to(room).emit("room_data", { 
      userCount: roomUsers[room],
      room: room 
    });

    // Emit join success to the user
    socket.emit("join_success");

    console.log(`Room ${room} now has ${roomUsers[room]} users`);
  });

  socket.on("send_message", (data) => {
    console.log(`Message from ${data.author} in room ${data.room}: ${data.message}`);
    
    // Clear typing status when message is sent
    const room = data.room;
    const username = data.author;
    if (typingUsers[room] && typingUsers[room][username]) {
      delete typingUsers[room][username];
      socket.to(room).emit("user_stopped_typing", { username, room });
    }
    
    // Broadcast message to all other users in the room
    socket.to(data.room).emit("receive_message", data);
  });

  socket.on("typing", ({ room, username }) => {
    if (!typingUsers[room]) {
      typingUsers[room] = {};
    }
    
    if (!typingUsers[room][username]) {
      typingUsers[room][username] = {
        socketId: socket.id,
        timestamp: Date.now()
      };
      
      // Broadcast to other users in the room that this user is typing
      socket.to(room).emit("user_typing", { username, room });
      console.log(`👀 ${username} is typing in room ${room}`);
    }
  });

  socket.on("stop_typing", ({ room, username }) => {
    if (typingUsers[room] && typingUsers[room][username]) {
      delete typingUsers[room][username];
      
      // Broadcast to other users that this user stopped typing
      socket.to(room).emit("user_stopped_typing", { username, room });
      console.log(`⏹️ ${username} stopped typing in room ${room}`);
    }
  });

  // WebRTC Signaling Events
  socket.on("start_call", (data) => {
    const { room, callType, caller } = data;
    console.log(`📞 ${caller} is starting a ${callType} call in room ${room}`);
    
    // Initialize active call for room
    if (!activeCalls[room]) {
      activeCalls[room] = {
        type: callType,
        participants: new Set(),
        startedBy: caller,
        startTime: Date.now()
      };
    }
    
    activeCalls[room].participants.add(caller);
    
    // Notify other users in the room about incoming call
    socket.to(room).emit("incoming_call", {
      caller: caller,
      callType: callType,
      room: room
    });
  });

  socket.on("join_call", (data) => {
    const { room, caller, joiner } = data;
    console.log(`📞 ${joiner} is joining the call with ${caller} in room ${room}`);
    
    if (activeCalls[room]) {
      activeCalls[room].participants.add(joiner);
    }
    
    // Notify the caller that someone joined
    socket.to(room).emit("call_accepted", {
      joiner: joiner,
      caller: caller
    });
  });

  socket.on("offer", (data) => {
    const { room, peerId, offer } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`🤝 Offer from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    // Find the target socket by username
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", {
        peerId: senderInfo?.username,
        offer: offer
      });
    } else {
      console.log(`❌ Could not find socket for user ${peerId} in room ${room}`);
    }
  });

  socket.on("answer", (data) => {
    const { room, peerId, answer } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`✅ Answer from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    // Find the target socket by username
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", {
        peerId: senderInfo?.username,
        answer: answer
      });
    } else {
      console.log(`❌ Could not find socket for user ${peerId} in room ${room}`);
    }
  });

  socket.on("ice_candidate", (data) => {
    const { room, peerId, candidate } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`🧊 ICE candidate from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    // Find the target socket by username
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice_candidate", {
        peerId: senderInfo?.username,
        candidate: candidate
      });
    } else {
      console.log(`❌ Could not find socket for user ${peerId} in room ${room}`);
    }
  });

  socket.on("decline_call", (data) => {
    const { room, user } = data;
    console.log(`❌ ${user} declined the call in room ${room}`);
    
    // Notify other users that the call was declined
    socket.to(room).emit("call_declined", {
      user: user,
      room: room
    });
  });

  socket.on("end_call", (data) => {
    const { room, user } = data;
    console.log(`📴 ${user} ended the call in room ${room}`);
    
    if (activeCalls[room]) {
      activeCalls[room].participants.delete(user);
      
      // If no participants left, clean up the call
      if (activeCalls[room].participants.size === 0) {
        delete activeCalls[room];
        console.log(`🧹 Cleaned up call data for room ${room}`);
      }
    }
    
    // Notify other users that the call was ended (but not the sender)
    socket.to(room).emit("call_ended", {
      user: user,
      room: room
    });
  });

  socket.on("leave_call", (data) => {
    const { room, user } = data;
    console.log(`🚪 ${user} left the call in room ${room}`);
    
    if (activeCalls[room]) {
      activeCalls[room].participants.delete(user);
      
      // If no participants left, clean up the call
      if (activeCalls[room].participants.size === 0) {
        delete activeCalls[room];
      }
    }
    
    // Notify other users that someone left the call
    socket.to(room).emit("user_left_call", {
      user: user,
      room: room
    });
  });

  socket.on("disconnect", () => {
    const room = userRooms[socket.id];
    const userInfo = userSockets[socket.id];
    
    console.log(`🔴 User Disconnected: ${socket.id}`);
    
    if (room && roomUsers[room]) {
      roomUsers[room]--;
      
      if (roomUsers[room] <= 0) {
        roomUsers[room] = 0;
      }
      
      // Remove username from room's username set
      if (userInfo && roomUsernames[room]) {
        const username = userInfo.username;
        roomUsernames[room].delete(username);
        
        // Clean up typing status
        if (typingUsers[room] && typingUsers[room][username]) {
          delete typingUsers[room][username];
          socket.to(room).emit("user_stopped_typing", { username, room });
        }
        
        // Clean up call participation
        if (activeCalls[room] && activeCalls[room].participants.has(username)) {
          activeCalls[room].participants.delete(username);
          
          // Notify other users that this user left the call
          socket.to(room).emit("user_left_call", {
            user: username,
            room: room
          });
          
          // If no participants left, clean up the call
          if (activeCalls[room].participants.size === 0) {
            delete activeCalls[room];
            console.log(`🧹 Cleaned up call data for room ${room} due to disconnect`);
          }
        }
        
        // Clean up empty room data
        if (roomUsernames[room].size === 0) {
          delete roomUsernames[room];
          delete typingUsers[room];
          delete activeCalls[room];
        }
      }
      
      // Emit updated user count to remaining users in the room
      io.to(room).emit("room_data", { 
        userCount: roomUsers[room],
        room: room 
      });
      
      if (userInfo) {
        console.log(`➖ ${userInfo.username} left room: ${room}. Remaining users: ${roomUsers[room]}`);
      }
      
      delete userRooms[socket.id];
      delete userSockets[socket.id];
    }
  });
});

// Clean up stale typing indicators every 30 seconds
setInterval(() => {
  const now = Date.now();
  const TYPING_TIMEOUT = 30000; // 30 seconds
  
  Object.keys(typingUsers).forEach(room => {
    Object.keys(typingUsers[room]).forEach(username => {
      const typingData = typingUsers[room][username];
      if (now - typingData.timestamp > TYPING_TIMEOUT) {
        delete typingUsers[room][username];
        io.to(room).emit("user_stopped_typing", { username, room });
        console.log(`🧹 Cleaned up stale typing indicator for ${username} in room ${room}`);
      }
    });
    
    // Clean up empty room typing data
    if (Object.keys(typingUsers[room]).length === 0) {
      delete typingUsers[room];
    }
  });
}, 30000);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeRooms: Object.keys(roomUsers).length,
    totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
    activeCalls: Object.keys(activeCalls).length
  });
});

// Get room statistics
app.get("/rooms/stats", (req, res) => {
  const stats = {
    totalRooms: Object.keys(roomUsers).length,
    totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
    activeCalls: Object.keys(activeCalls).length,
    roomDetails: Object.keys(roomUsers).map(room => ({
      room: room,
      userCount: roomUsers[room],
      hasActiveCall: !!activeCalls[room],
      callType: activeCalls[room]?.type || null
    }))
  };
  
  res.status(200).json(stats);
});

server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`📞 WebRTC signaling server ready`);
  console.log(`🌐 Health check available at http://localhost:${PORT}/health`);
});