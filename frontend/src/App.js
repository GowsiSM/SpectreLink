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

  // Socket created in useEffect, not on button click
  // React owns this lifecycle now. Socket is created once on mount,
  // torn down completely on unmount. No button click needed.
  useEffect(() => {
    const socketURL =
      process.env.REACT_APP_SOCKET_URL ||
      "https://spectrelink-backend.onrender.com";

    const socket = io(socketURL, {
      transports: ["websocket"],
    });

    // Store in ref so joinRoom and handleLogout can access it
    // without causing re-renders
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      // No stale closure here — setErrorMessage is stable,
      // err comes from the event, no external state read
      setErrorMessage("Connection error: " + err.message);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Disconnected from server");
    });

    socket.on("room_data", (data) => {
      // ✅ setUserCount is a stable setter — safe to call directly
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

    // Proper cleanup — removes ALL listeners AND disconnects
    // This runs when the component unmounts (tab close, navigation)
    // Server is notified. No ghost connections left behind.
    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("room_data");
      socket.off("join_success");
      socket.off("join_error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Empty array = run once on mount, clean up on unmount

  // ✅ joinRoom is now clean — just validates and emits
  // Socket already exists by the time user sees the form
  const joinRoom = () => {
    if (username.trim() !== "" && room.trim() !== "") {
      if (!socketRef.current) return; // guard for edge cases
      setIsJoining(true);
      setErrorMessage("");
      socketRef.current.emit("join_room", { room, username });
    }
  };

  const handleLogout = () => {
    setShowChat(false);
    setUsername("");
    setRoom("");
    setUserCount(0);
    setErrorMessage("");
    setIsJoining(false);
    // Socket will be disconnected by useEffect cleanup when component unmounts
    // If you want immediate disconnect on logout without unmounting, keep this:
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

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
