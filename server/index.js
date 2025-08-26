const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
require('dotenv').config();

// Comprehensive environment debugging
console.log('🔍 COMPREHENSIVE ENVIRONMENT CHECK:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', process.env.PORT);
console.log('- MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('- MONGODB_URI length:', process.env.MONGODB_URI?.length || 0);
console.log('- MONGODB_URI preview:', process.env.MONGODB_URI?.substring(0, 50) + '...');

// If MONGODB_URI is missing, list all environment variables for debugging
if (!process.env.MONGODB_URI) {
  console.log('🚨 MONGODB_URI IS MISSING!');
  console.log('📋 All environment variables:');
  Object.keys(process.env).forEach(key => {
    console.log(`  ${key}: ${key.includes('PASS') || key.includes('SECRET') || key.includes('KEY') ? '[HIDDEN]' : process.env[key]}`);
  });
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Disable Mongoose buffering globally to prevent timeout errors when disconnected
mongoose.set('bufferCommands', false);

// MongoDB Connection with improved error handling and connection options
const connectDB = async () => {
  try {
    // Check if MONGODB_URI is defined
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI environment variable is not defined!');
      throw new Error('MONGODB_URI environment variable is required');
    }
    
    console.log('🔗 Attempting to connect to MongoDB Atlas...');
    console.log('🔗 Database name: spectreDB');
    
    // Updated connection options - removed deprecated options and added better timeouts
    const connectionOptions = {
      serverSelectionTimeoutMS: 15000, // Reduced from 30000
      connectTimeoutMS: 15000,         // Reduced from 30000
      socketTimeoutMS: 15000,          // Reduced from 30000
      maxPoolSize: 5,                  // Reduced from 10
      minPoolSize: 1,
      bufferCommands: false,           // Disable buffering
      retryWrites: true,
      retryReads: true,
      maxIdleTimeMS: 30000,           // Close connections after 30s idle
    };
    
    await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
    
    console.log('📦 MongoDB Atlas Connected Successfully');
    console.log('📊 Connection state:', mongoose.connection.readyState);
    console.log('🏷️ Connected to database:', mongoose.connection.name);
    
    // Test connection with a simple operation
    await mongoose.connection.db.admin().ping();
    console.log('🏓 Database ping successful');
    
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    
    // Additional debugging for DNS issues
    if (error.message.includes('ENOTFOUND') || error.message.includes('querySrv')) {
      console.error('🌐 DNS Resolution Issue detected. This could be caused by:');
      console.error('   1. Incorrect MongoDB cluster hostname');
      console.error('   2. Network connectivity issues');
      console.error('   3. Firewall blocking MongoDB Atlas');
      console.error('   4. Invalid connection string format');
      
      // Try to extract and validate the hostname
      const mongoUri = process.env.MONGODB_URI;
      const hostnameMatch = mongoUri.match(/mongodb\+srv:\/\/[^@]+@([^\/]+)/);
      if (hostnameMatch) {
        console.error(`🔍 Extracted hostname: ${hostnameMatch[1]}`);
      }
    } else if (error.message.includes('Authentication failed')) {
      console.error('🔐 Authentication Issue:');
      console.error('   1. Check username and password');
      console.error('   2. Verify user exists in MongoDB Atlas');
      console.error('   3. Check password URL encoding');
    } else if (error.message.includes('not authorized')) {
      console.error('🚫 Authorization Issue:');
      console.error('   1. Check user permissions in MongoDB Atlas');
      console.error('   2. Ensure user has read/write access to spectreDB');
    }
    
    console.log('🔄 Application will continue without database persistence...');
    console.log('📱 Real-time features (chat, calls) will still work');
  }
};

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB Atlas');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔴 MongoDB connection closed through app termination');
  process.exit(0);
});

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

// Helper function to safely execute database operations
const safeDbOperation = async (operation, fallback = null) => {
  if (!isDatabaseConnected()) {
    console.log('⚠️ Database not connected - skipping operation');
    return fallback;
  }
  
  try {
    return await operation();
  } catch (error) {
    console.error('⚠️ Database operation failed:', error.message);
    
    // If it's a timeout or connection error, mark as disconnected
    if (error.message.includes('buffering timed out') || 
        error.message.includes('connection') ||
        error.message.includes('timeout')) {
      console.log('🔌 Database appears disconnected, will retry operations...');
    }
    
    return fallback;
  }
};

// Helper function to check database connection
const isDatabaseConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Connect to MongoDB
connectDB();

// --- WebSocket (Chat logic) ---
const allowedOrigins = ( "http://localhost:3000,https://spectre-link.vercel.app")
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

      // Save user session to database (using safe operation)
      await safeDbOperation(async () => {
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
        return true;
      });

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
      
      const messageId = data.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date();
      
      // Save message to database (using safe operation)
      await safeDbOperation(async () => {
        const messageDoc = new Message({
          room: data.room,
          author: data.author,
          message: data.message,
          messageId: messageId,
          timestamp: timestamp
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
        return true;
      });

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
        time: timestamp.toISOString(),
        messageId: messageId
      });
    } catch (error) {
      console.error('❌ Error processing message:', error);
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

  socket.on("media_state_change", (data) => {
    const { room, user, isMuted, isVideoOff } = data;
    
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
      // Remove user session from database (using safe operation)
      await safeDbOperation(async () => {
        await UserSession.deleteOne({ socketId: socket.id });
        return true;
      });
      
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

  // Clean up old user sessions (using safe operation)
  await safeDbOperation(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await UserSession.deleteMany({
      lastActivity: { $lt: oneHourAgo }
    });
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} old user sessions`);
    }
    return result;
  });
}, 30000);

// API Routes
app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Use safe operations for database queries
    const totalMessages = await safeDbOperation(async () => {
      return await Message.countDocuments();
    }, 0);
    
    const totalRooms = await safeDbOperation(async () => {
      return await Room.countDocuments();
    }, 0);
    
    res.status(200).json({
      status: "healthy",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      activeRooms: Object.keys(roomUsers).length,
      totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
      activeCalls: Object.keys(activeCalls).length,
      totalMessages: totalMessages,
      totalRoomsCreated: totalRooms,
      databaseConnected: isDatabaseConnected(),
      mongooseReadyState: mongoose.connection.readyState
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
    // Use safe operations for database queries
    const totalMessages = await safeDbOperation(async () => {
      return await Message.countDocuments();
    }, 0);
    
    const totalRooms = await safeDbOperation(async () => {
      return await Room.countDocuments();
    }, 0);
    
    const stats = {
      totalRooms: Object.keys(roomUsers).length,
      totalUsers: Object.values(roomUsers).reduce((sum, count) => sum + count, 0),
      activeCalls: Object.keys(activeCalls).length,
      totalMessages: totalMessages,
      totalRoomsEverCreated: totalRooms,
      databaseConnected: isDatabaseConnected(),
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
    
    const result = await safeDbOperation(async () => {
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
      
      const total = await Message.countDocuments({ room: roomId });
      
      return { messages: formattedMessages, total };
    }, { messages: [], total: 0 });
    
    if (!result) {
      return res.status(503).json({
        error: "Database not connected",
        messages: [],
        total: 0
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      messages: [],
      total: 0
    });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`📞 WebRTC signaling server ready`);
  console.log(`📦 MongoDB integration active (${isDatabaseConnected() ? 'connected' : 'disconnected'})`);
  console.log(`🌐 Health check available at http://localhost:${PORT}/health`);
});