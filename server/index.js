// // server/index.js
// const express = require("express");
// const http = require("http");
// const cors = require("cors");
// const bodyParser = require("body-parser");
// const { Server } = require("socket.io");
// const mongoose = require("mongoose");

// const connectDB = require("./db");
// const WebVital = require("./models/WebVital");

// const app = express();
// const server = http.createServer(app);
// const PORT = 3001;

// // MongoDB Connection
// connectDB();

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(bodyParser.json());

// // --- WebSocket (Chat logic) ---
// const io = new Server(server, {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"],
//   },
// });

// let roomUsers = {}; // Track user count per room
// let userRooms = {}; // Track which room each socket is in
// let userSockets = {}; // Track socket info per user
// let roomUsernames = {}; // Track usernames per room to prevent duplicates

// io.on("connection", (socket) => {
//   console.log(`🟢 User Connected: ${socket.id}`);

//   socket.on("join_room", ({ room, username }) => {
//     // Initialize room data if it doesn't exist
//     if (!roomUsernames[room]) {
//       roomUsernames[room] = new Set();
//     }
    
//     // Check if username already exists in the room
//     if (roomUsernames[room].has(username)) {
//       socket.emit("join_error", { 
//         message: "Username already taken in this room. Please choose a different username." 
//       });
//       console.log(`❌ ${username} tried to join room ${room} but username is already taken`);
//       return;
//     }

//     socket.join(room);
//     userRooms[socket.id] = room;
//     userSockets[socket.id] = { username, room };
    
//     // Add username to room's username set
//     roomUsernames[room].add(username);
    
//     console.log(`➕ ${username} (${socket.id}) joined room: ${room}`);

//     // Update room user count
//     if (!roomUsers[room]) roomUsers[room] = 0;
//     roomUsers[room]++;

//     // Emit updated user count to all users in the room
//     io.to(room).emit("room_data", { 
//       userCount: roomUsers[room],
//       room: room 
//     });

//     // Emit join success to the user
//     socket.emit("join_success");

//     console.log(`Room ${room} now has ${roomUsers[room]} users`);
//   });

//   socket.on("send_message", (data) => {
//     console.log(`Message from ${data.author} in room ${data.room}: ${data.message}`);
//     // Broadcast message to all other users in the room
//     socket.to(data.room).emit("receive_message", data);
//   });

//   socket.on("disconnect", () => {
//     const room = userRooms[socket.id];
//     const userInfo = userSockets[socket.id];
    
//     console.log(`🔴 User Disconnected: ${socket.id}`);
    
//     if (room && roomUsers[room]) {
//       roomUsers[room]--;
      
//       if (roomUsers[room] <= 0) {
//         roomUsers[room] = 0;
//       }
      
//       // Remove username from room's username set
//       if (userInfo && roomUsernames[room]) {
//         roomUsernames[room].delete(userInfo.username);
        
//         // Clean up empty room data
//         if (roomUsernames[room].size === 0) {
//           delete roomUsernames[room];
//         }
//       }
      
//       // Emit updated user count to remaining users in the room
//       io.to(room).emit("room_data", { 
//         userCount: roomUsers[room],
//         room: room 
//       });
      
//       if (userInfo) {
//         console.log(`➖ ${userInfo.username} left room: ${room}. Remaining users: ${roomUsers[room]}`);
//       }
      
//       delete userRooms[socket.id];
//       delete userSockets[socket.id];
//     }
//   });
// });

// // --- REST API Routes for Web Vitals ---

// // POST endpoint to receive web vitals data
// app.post("/web-vitals", async (req, res) => {
//   try {
//     const vitalData = req.body;
//     console.log(`📊 Received Web Vital: ${vitalData.name} = ${vitalData.value} (${vitalData.rating}) from ${vitalData.username} in room ${vitalData.room}`);
    
//     const webVital = new WebVital(vitalData);
//     await webVital.save();
    
//     res.status(200).json({ message: "Web vital saved successfully" });
//   } catch (error) {
//     console.error("Error saving web vital:", error);
//     res.status(500).json({ error: "Failed to save web vital" });
//   }
// });

// // GET endpoint to retrieve web vitals data
// app.get("/web-vitals", async (req, res) => {
//   try {
//     const { room, username, limit = 50 } = req.query;
    
//     let query = {};
//     if (room) query.room = room;
//     if (username) query.username = username;
    
//     const vitals = await WebVital.find(query)
//       .sort({ timestamp: -1 })
//       .limit(parseInt(limit));
      
//     res.status(200).json(vitals);
//   } catch (error) {
//     console.error("Error fetching web vitals:", error);
//     res.status(500).json({ error: "Failed to fetch web vitals" });
//   }
// });

// // GET endpoint for performance analytics
// app.get("/web-vitals/analytics", async (req, res) => {
//   try {
//     const { room } = req.query;
    
//     let matchStage = {};
//     if (room) matchStage.room = room;
    
//     const analytics = await WebVital.aggregate([
//       { $match: matchStage },
//       {
//         $group: {
//           _id: "$name",
//           avgValue: { $avg: "$value" },
//           minValue: { $min: "$value" },
//           maxValue: { $max: "$value" },
//           count: { $sum: 1 },
//           goodCount: {
//             $sum: { $cond: [{ $eq: ["$rating", "good"] }, 1, 0] }
//           },
//           needsImprovementCount: {
//             $sum: { $cond: [{ $eq: ["$rating", "needs-improvement"] }, 1, 0] }
//           },
//           poorCount: {
//             $sum: { $cond: [{ $eq: ["$rating", "poor"] }, 1, 0] }
//           }
//         }
//       }
//     ]);
    
//     res.status(200).json(analytics);
//   } catch (error) {
//     console.error("Error fetching analytics:", error);
//     res.status(500).json({ error: "Failed to fetch analytics" });
//   }
// });

// server.listen(PORT, () => {
//   console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
//   console.log(`📡 WebSocket server ready for connections`);
//   console.log(`📊 Web Vitals API endpoints available`);
// });

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
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let roomUsers = {}; // Track user count per room
let userRooms = {}; // Track which room each socket is in
let userSockets = {}; // Track socket info per user
let roomUsernames = {}; // Track usernames per room to prevent duplicates
let typingUsers = {}; // Track typing users per room

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
        roomUsernames[room].delete(userInfo.username);
        
        // Clean up typing status
        if (typingUsers[room] && typingUsers[room][userInfo.username]) {
          delete typingUsers[room][userInfo.username];
          socket.to(room).emit("user_stopped_typing", { username: userInfo.username, room });
        }
        
        // Clean up empty room data
        if (roomUsernames[room].size === 0) {
          delete roomUsernames[room];
          delete typingUsers[room]; // Clean up typing data for empty rooms
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

server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});