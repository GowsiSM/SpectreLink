const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
    });
    console.log('📦 MongoDB Connected Successfully');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// MongoDB Schemas
const messageSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true,
    index: true
  },
  author: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  messageId: {
    type: String,
    required: true,
    unique: true
  }
});

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  totalMessages: {
    type: Number,
    default: 0
  }
});

const userSessionSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true
  },
  socketId: {
    type: String,
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for better performance
messageSchema.index({ room: 1, timestamp: -1 });
userSessionSchema.index({ room: 1, username: 1 });

const Message = mongoose.model('Message', messageSchema);
const Room = mongoose.model('Room', roomSchema);
const UserSession = mongoose.model('UserSession', userSessionSchema);

// Connect to MongoDB
connectDB();

// --- WebSocket (Chat logic) ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,https://spectre-link.vercel.app")
  .split(",")
  .map(s => s.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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

  socket.on("join_room", async ({ room, username }) => {
    try {
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

      // Save user session to database
      const userSession = new UserSession({
        username,
        room,
        socketId: socket.id
      });
      await userSession.save();

      // Create or update room in database
      await Room.findOneAndUpdate(
        { roomId: room },
        { 
          roomId: room,
          lastActivity: new Date()
        },
        { upsert: true, new: true }
      );

      // Get recent messages from database (last 50)
      const recentMessages = await Message.find({ room })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      // Send recent messages to the user (in correct order)
      const messagesToSend = recentMessages.reverse().map(msg => ({
        room: msg.room,
        author: msg.author,
        message: msg.message,
        time: msg.timestamp.toISOString(),
        messageId: msg.messageId
      }));

      socket.emit("previous_messages", messagesToSend);

      // Emit updated user count to all users in the room
      io.to(room).emit("room_data", { 
        userCount: roomUsers[room],
        room: room 
      });

      // Emit join success to the user
      socket.emit("join_success");

      console.log(`Room ${room} now has ${roomUsers[room]} users`);
    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit("join_error", { 
        message: "Failed to join room. Please try again." 
      });
    }
  });

  socket.on("send_message", async (data) => {
    try {
      console.log(`Message from ${data.author} in room ${data.room}: ${data.message}`);
      
      // Save message to database
      const messageDoc = new Message({
        room: data.room,
        author: data.author,
        message: data.message,
        messageId: data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
      
      await messageDoc.save();

      // Update room's last activity and message count
      await Room.findOneAndUpdate(
        { roomId: data.room },
        { 
          lastActivity: new Date(),
          $inc: { totalMessages: 1 }
        }
      );

      // Clear typing status when message is sent
      const room = data.room;
      const username = data.author;
      if (typingUsers[room] && typingUsers[room][username]) {
        delete typingUsers[room][username];
        socket.to(room).emit("user_stopped_typing", { username, room });
      }
      
      // Broadcast message to all other users in the room
      socket.to(data.room).emit("receive_message", {
        ...data,
        time: messageDoc.timestamp.toISOString(),
        messageId: messageDoc.messageId
      });
    } catch (error) {
      console.error('❌ Error saving message:', error);
      socket.emit("message_error", { 
        message: "Failed to send message. Please try again." 
      });
    }
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
    
    if (!activeCalls[room]) {
      activeCalls[room] = {
        type: callType,
        participants: new Set(),
        startedBy: caller,
        startTime: Date.now()
      };
    }
    
    activeCalls[room].participants.add(caller);
    
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
    
    socket.to(room).emit("call_accepted", {
      joiner: joiner,
      caller: caller
    });
  });

  socket.on("offer", (data) => {
    const { room, peerId, offer } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`🤝 Offer from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", {
        peerId: senderInfo?.username,
        offer: offer
      });
    }
  });

  socket.on("answer", (data) => {
    const { room, peerId, answer } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`✅ Answer from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", {
        peerId: senderInfo?.username,
        answer: answer
      });
    }
  });

  socket.on("ice_candidate", (data) => {
    const { room, peerId, candidate } = data;
    const senderInfo = userSockets[socket.id];
    console.log(`🧊 ICE candidate from ${senderInfo?.username} to ${peerId} in room ${room}`);
    
    const targetSocketId = Object.keys(userSockets).find(
      socketId => userSockets[socketId].username === peerId && userSockets[socketId].room === room
    );
    
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice_candidate", {
        peerId: senderInfo?.username,
        candidate: candidate
      });
    }
  });

  socket.on("decline_call", (data) => {
    const { room, user } = data;
    console.log(`❌ ${user} declined the call in room ${room}`);
    
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
      
      if (activeCalls[room].participants.size === 0) {
        delete activeCalls[room];
        console.log(`🧹 Cleaned up call data for room ${room}`);
      }
    }
    
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
      
      if (activeCalls[room].participants.size === 0) {
        delete activeCalls[room];
      }
    }
    
    socket.to(room).emit("user_left_call", {
      user: user,
      room: room
    });
  });

  // FIXED: Handle media state changes properly
  socket.on("media_state_change", (data) => {
    const { room, user, isMuted, isVideoOff } = data;
    const senderInfo = userSockets[socket.id];
    
    console.log(`🔊 ${user} changed media state in room ${room}: muted=${isMuted}, videoOff=${isVideoOff}`);
    
    // Broadcast to all other users in the room
    socket.to(room).emit("media_state_changed", {
      user: user,
      room: room,
      isMuted: isMuted,
      isVideoOff: isVideoOff
    });
  });

  socket.on("disconnect", async () => {
    const room = userRooms[socket.id];
    const userInfo = userSockets[socket.id];
    
    console.log(`🔴 User Disconnected: ${socket.id}`);
    
    try {
      // Remove user session from database
      await UserSession.deleteOne({ socketId: socket.id });
      
      if (room && roomUsers[room]) {
        roomUsers[room]--;
        
        if (roomUsers[room] <= 0) {
          roomUsers[room] = 0;
        }
        
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
            
            socket.to(room).emit("user_left_call", {
              user: username,
              room: room
            });
            
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
    } catch (error) {
      console.error('❌ Error during disconnect cleanup:', error);
    }
  });
});

// Clean up stale typing indicators and old sessions
setInterval(async () => {
  const now = Date.now();
  const TYPING_TIMEOUT = 30000; // 30 seconds
  
  // Clean typing indicators
  Object.keys(typingUsers).forEach(room => {
    Object.keys(typingUsers[room]).forEach(username => {
      const typingData = typingUsers[room][username];
      if (now - typingData.timestamp > TYPING_TIMEOUT) {
        delete typingUsers[room][username];
        io.to(room).emit("user_stopped_typing", { username, room });
        console.log(`🧹 Cleaned up stale typing indicator for ${username} in room ${room}`);
      }
    });
    
    if (Object.keys(typingUsers[room]).length === 0) {
      delete typingUsers[room];
    }
  });

  // Clean up old user sessions (older than 1 hour with no activity)
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await UserSession.deleteMany({
      lastActivity: { $lt: oneHourAgo }
    });
  } catch (error) {
    console.error('❌ Error cleaning old sessions:', error);
  }
}, 30000);

// API Routes
app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const totalMessages = await Message.countDocuments();
    const totalRooms = await Room.countDocuments();
    
    res.status(200).json({
      status: "healthy",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      activeRooms: Object.keys(roomUsers).length,
      totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
      activeCalls: Object.keys(activeCalls).length,
      totalMessages: totalMessages,
      totalRoomsCreated: totalRooms
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

app.get("/rooms/stats", async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    const totalRooms = await Room.countDocuments();
    
    const stats = {
      totalRooms: Object.keys(roomUsers).length,
      totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
      activeCalls: Object.keys(activeCalls).length,
      totalMessages: totalMessages,
      totalRoomsEverCreated: totalRooms,
      roomDetails: Object.keys(roomUsers).map(room => ({
        room: room,
        userCount: roomUsers[room],
        hasActiveCall: !!activeCalls[room],
        callType: activeCalls[room]?.type || null
      }))
    };
    
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Get messages for a specific room
app.get("/rooms/:roomId/messages", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const messages = await Message.find({ room: roomId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();
    
    const formattedMessages = messages.reverse().map(msg => ({
      room: msg.room,
      author: msg.author,
      message: msg.message,
      time: msg.timestamp.toISOString(),
      messageId: msg.messageId
    }));
    
    res.json({
      messages: formattedMessages,
      total: await Message.countDocuments({ room: roomId })
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`📞 WebRTC signaling server ready`);
  console.log(`📦 MongoDB integration active`);
  console.log(`🌐 Health check available at http://localhost:${PORT}/health`);
});