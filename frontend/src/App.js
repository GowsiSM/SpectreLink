// src/App.js
import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./App.css";
import Chat from "./Chat";

function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const socketRef = useRef(null);

  // Initialize socket connection
  const initializeSocket = () => {
    if (!socketRef.current) {
      const socketURL =
        process.env.REACT_APP_SOCKET_URL ||
        "https://spectrelink-backend.onrender.com";
      console.log("🔌 Initializing socket with URL:", socketURL);

      socketRef.current = io(socketURL, {
        transports: ["websocket"],
      });

      // Connection event listeners
      socketRef.current.on("connect", () => {
        console.log("✅ Connected:", socketRef.current.id);
      });

      socketRef.current.on("connect_error", (err) => {
        console.log("❌ Connection Error:", err.message);
        setErrorMessage("Connection error: " + err.message);
      });

      socketRef.current.on("disconnect", () => {
        console.log("🔌 Disconnected from server");
      });

      // Room event listeners (set up when socket is created)
      socketRef.current.on("room_data", (data) => {
        console.log("📊 Received room_data:", data);
        setUserCount(data.userCount);
      });

      socketRef.current.on("join_success", () => {
        console.log("✅ Join success! Moving to chat...");
        setShowChat(true);
        setIsJoining(false);
        setErrorMessage("");
      });

      socketRef.current.on("join_error", (data) => {
        console.log("❌ Join error:", data.message);
        setErrorMessage(data.message);
        setIsJoining(false);
        setShowChat(false);
      });
    }
    return socketRef.current;
  };

  const joinRoom = () => {
    if (username.trim() !== "" && room.trim() !== "") {
      setIsJoining(true);
      setErrorMessage("");
      const socket = initializeSocket();
      console.log("📤 Emitting join_room event with:", { room, username });
      socket.emit("join_room", { room, username });
    }
  };

  const handleLogout = () => {
    // Reset all states
    setShowChat(false);
    setUsername("");
    setRoom("");
    setUserCount(0);
    setErrorMessage("");
    setIsJoining(false);

    // Clear socket reference so a new connection can be made
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.off("room_data");
        socketRef.current.off("join_success");
        socketRef.current.off("join_error");
      }
    };
  }, []);

  return (
    <div className="App">
      {!showChat ? (
        <div className="joinChatContainer">
          <h3>Join A Chat</h3>
          {errorMessage && (
            <div
              className="error-message"
              style={{ color: "red", marginBottom: "10px" }}
            >
              {errorMessage}
            </div>
          )}
          <input
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && joinRoom()}
            disabled={isJoining}
          />
          <input
            type="text"
            placeholder="Room ID"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && joinRoom()}
            disabled={isJoining}
          />
          <button onClick={joinRoom} disabled={isJoining}>
            {isJoining ? "Joining..." : "Join Room"}
          </button>
        </div>
      ) : (
        <Chat
          socket={socketRef.current}
          username={username}
          room={room}
          userCount={userCount}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
