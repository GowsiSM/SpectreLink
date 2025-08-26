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
    socketRef.current = io("https://spectrelink.onrender.com", {
      transports: ["websocket"], 
    });
  }
    return socketRef.current;
  };

  const joinRoom = () => {
    if (username.trim() !== "" && room.trim() !== "") {
      setIsJoining(true);
      setErrorMessage("");
      const socket = initializeSocket();
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
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("room_data", (data) => {
      setUserCount(data.userCount);
    });

    socket.on("join_success", () => {
      setShowChat(true);
      setIsJoining(false);
      setErrorMessage("");
    });

    socket.on("join_error", (data) => {
      setErrorMessage(data.message);
      setIsJoining(false);
      setShowChat(false);
    });

    return () => {
      if (socket) {
        socket.off("room_data");
        socket.off("join_success");
        socket.off("join_error");
      }
    };
  }, [socketRef.current]);

  return (
    <div className="App">
      {!showChat ? (
        <div className="joinChatContainer">
          <h3>Join A Chat</h3>
          {errorMessage && (
            <div className="error-message" style={{color: 'red', marginBottom: '10px'}}>
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