// Chat.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import ScrollToBottom from "react-scroll-to-bottom";
import EmojiPicker from "emoji-picker-react";
import "./Chat.css";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Helper function to format time consistently
const formatTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Helper function to format any timestamp to HH:MM
const formatTimestamp = (timestamp) => {
  try {
    // Handle different timestamp formats
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      // If it's not a valid date, return the original timestamp
      return timestamp;
    }
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  } catch (error) {
    // If any error occurs, return the original timestamp
    return timestamp;
  }
};

function Chat({ socket, username, room, userCount, onLogout }) {
  const [currentMessage, setCurrentMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // WebRTC states
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [incomingCall, setIncomingCall] = useState(null);
  const [connectedPeers, setConnectedPeers] = useState(new Map());

  // Media control states
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callDuration, setCallDuration] = useState("00:00");

  // Peer media states - track mute/video status of remote peers
  const [peerMediaStates, setPeerMediaStates] = useState(new Map());

  // Refs
  const textareaRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const callTimerRef = useRef(null);

  // Helper function to add system messages to chat
  const addSystemMessage = useCallback(
    (message) => {
      const systemMessage = {
        room: room,
        author: "System",
        message: message,
        time: formatTime(),
        isSystem: true,
      };
      setMessageList((list) => [...list, systemMessage]);
    },
    [room],
  );

  // Auto-expand textarea
  const handleInputChange = useCallback((e) => {
    setCurrentMessage(e.target.value);
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Set height based on scrollHeight, with a max height
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  // Update call timer
  useEffect(() => {
    if (inCall && callStartTime) {
      callTimerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        setCallDuration(
          `${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`,
        );
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallDuration("00:00");
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [inCall, callStartTime]);

  const sendMessage = async () => {
    if (currentMessage.trim() !== "") {
      const messageData = {
        room: room,
        author: username,
        message: currentMessage,
        time: formatTime(),
      };

      await socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setCurrentMessage("");
      setShowEmojiPicker(false);
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  // Toggle mute/unmute - safe state update
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    setIsMuted((prev) => {
      const next = !prev;
      audioTracks.forEach((track) => {
        track.enabled = !next; // enabled=false means muted
      });
      socket.emit("media_state_change", {
        room,
        user: username,
        isMuted: next,
        isVideoOff,
      });
      return next;
    });
  }, [room, socket, username, isVideoOff]);

  // Toggle video on/off - safe state update
  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current || callType !== "video") return;

    const videoTracks = localStreamRef.current.getVideoTracks();
    setIsVideoOff((prev) => {
      const next = !prev;
      videoTracks.forEach((track) => {
        track.enabled = !next; // enabled=false means video off
      });
      socket.emit("media_state_change", {
        room,
        user: username,
        isMuted,
        isVideoOff: next,
      });
      return next;
    });
  }, [callType, room, socket, username, isMuted]);

  // Memoized function to handle peer disconnection
  const handlePeerDisconnected = useCallback(
    (peerId) => {
      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }

      remoteVideosRef.current.delete(peerId);
      setConnectedPeers((prev) => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });

      // Remove peer media state
      setPeerMediaStates((prev) => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });

      // Only end call if no peers left AND we're still in call
      if (inCall && peerConnectionsRef.current.size === 0) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }
        setInCall(false);
        setCallType(null);
        setConnectedPeers(new Map());
        setPeerMediaStates(new Map());
        setCallStartTime(null);
        setIsMuted(false);
        setIsVideoOff(false);
      }
    },
    [inCall],
  );

  // Memoized function to create peer connection
  const createPeerConnection = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection(rtcConfig);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice_candidate", {
            room,
            peerId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;

        // Update connected peers
        setConnectedPeers((prev) => {
          const updated = new Map(prev);
          updated.set(peerId, { stream: remoteStream });
          return updated;
        });

        // Set video element source
        setTimeout(() => {
          const videoElement = remoteVideosRef.current.get(peerId);
          if (videoElement && remoteStream) {
            videoElement.srcObject = remoteStream;
          }
        }, 100);
      };

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          handlePeerDisconnected(peerId);
        }
      };

      return pc;
    },
    [room, socket, handlePeerDisconnected],
  );

  // Memoized function to end call
  const endCall = useCallback(() => {
    if (!inCall) return;

    const finalDuration = callDuration;
    const currentCallType = callType;

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Clear remote videos
    remoteVideosRef.current.clear();

    // Update state
    setInCall(false);
    setCallType(null);
    setConnectedPeers(new Map());
    setPeerMediaStates(new Map());
    setCallStartTime(null);
    setIsMuted(false);
    setIsVideoOff(false);

    // Add system message about call ending
    if (currentCallType && finalDuration !== "00:00") {
      const callEndMessage = `${
        currentCallType.charAt(0).toUpperCase() + currentCallType.slice(1)
      } call ended. Duration: ${finalDuration}`;
      addSystemMessage(callEndMessage);
    }

    socket.emit("end_call", { room, user: username });
  }, [
    inCall,
    callDuration,
    callType,
    room,
    socket,
    username,
    addSystemMessage,
  ]);

  const handleLogout = useCallback(() => {
    setShowEmojiPicker(false);

    if (inCall) {
      endCall();
    }

    // Close PCs and clear refs as extra safety
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    remoteVideosRef.current.clear();

    socket.disconnect();
    onLogout();
  }, [inCall, endCall, socket, onLogout]);

  // WebRTC Functions
  const getUserMedia = async (video = false) => {
    try {
      const constraints = {
        audio: true,
        video: video ? { width: 640, height: 480 } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Ensure the local video element gets the stream immediately
      if (localVideoRef.current && video) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw error;
    }
  };

  const startCall = async (type) => {
    try {
      const stream = await getUserMedia(type === "video");
      setCallType(type);
      setInCall(true);
      setCallStartTime(Date.now());
      setIsMuted(false);
      setIsVideoOff(false);

      // Make sure local preview appears instantly
      if (localVideoRef.current && type === "video") {
        localVideoRef.current.srcObject = stream;
      }

      // Add system message about call starting (FIXED: use `type`)
      const callStartMessage = `${
        type.charAt(0).toUpperCase() + type.slice(1)
      } call started by ${username}`;
      addSystemMessage(callStartMessage);

      // Emit call start to other users in room
      socket.emit("start_call", {
        room,
        callType: type,
        caller: username,
      });
    } catch (error) {
      console.error("Error starting call:", error);
      alert("Could not access camera/microphone");
    }
  };

  const joinCall = async (callData) => {
    try {
      const stream = await getUserMedia(callData.callType === "video");
      setCallType(callData.callType);
      setInCall(true);
      setIncomingCall(null);
      setCallStartTime(Date.now());
      setIsMuted(false);
      setIsVideoOff(false);

      // Ensure local preview appears when joining
      if (localVideoRef.current && callData.callType === "video") {
        localVideoRef.current.srcObject = stream;
      }

      // Add system message about joining call
      const joinMessage = `${username} joined the ${callData.callType} call`;
      addSystemMessage(joinMessage);

      socket.emit("join_call", {
        room,
        caller: callData.caller,
        joiner: username,
      });
    } catch (error) {
      console.error("Error joining call:", error);
      alert("Could not access camera/microphone");
    }
  };

  const declineCall = () => {
    setIncomingCall(null);
    socket.emit("decline_call", { room, user: username });
  };

  // Socket event listeners for WebRTC
  useEffect(() => {
    // Remove existing listeners to prevent duplicates
    socket.off("receive_message");
    socket.off("incoming_call");
    socket.off("call_accepted");
    socket.off("offer");
    socket.off("answer");
    socket.off("ice_candidate");
    socket.off("call_declined");
    socket.off("call_ended");
    socket.off("user_left_call");
    socket.off("media_state_change");
    socket.off("media_state_changed");

    // Add listeners
    socket.on("receive_message", (data) => {
      setMessageList((list) => [...list, data]);
    });

    // WebRTC signaling events
    socket.on("incoming_call", (callData) => {
      setIncomingCall(callData);
      const incomingMessage = `Incoming ${callData.callType} call from ${callData.caller}`;
      addSystemMessage(incomingMessage);
    });

    socket.on("call_accepted", async (data) => {
      const pc = createPeerConnection(data.joiner);
      peerConnectionsRef.current.set(data.joiner, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", {
          room,
          peerId: data.joiner,
          offer,
        });
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    });

    socket.on("offer", async (data) => {
      // Create peer connection if it doesn't exist
      if (!peerConnectionsRef.current.has(data.peerId)) {
        const pc = createPeerConnection(data.peerId);
        peerConnectionsRef.current.set(data.peerId, pc);

        // Add local stream tracks
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current);
          });
        }
      }

      const pc = peerConnectionsRef.current.get(data.peerId);
      if (pc) {
        try {
          await pc.setRemoteDescription(data.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", {
            room,
            peerId: data.peerId,
            answer,
          });
        } catch (error) {
          console.error("Error handling offer:", error);
        }
      }
    });

    socket.on("answer", async (data) => {
      const pc = peerConnectionsRef.current.get(data.peerId);
      if (pc) {
        try {
          await pc.setRemoteDescription(data.answer);
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    socket.on("ice_candidate", async (data) => {
      const pc = peerConnectionsRef.current.get(data.peerId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      } else {
        console.warn(
          `Cannot add ICE candidate from ${data.peerId} - no remote description`,
        );
      }
    });

    socket.on("call_declined", () => {
      setIncomingCall(null);
    });

    socket.on("call_ended", (data) => {
      if (data.user !== username) {
        const leaveMessage = `${data.user} left the call`;
        addSystemMessage(leaveMessage);
        handlePeerDisconnected(data.user);
      }
    });

    socket.on("user_left_call", (data) => {
      if (data.user !== username) {
        const leaveMessage = `${data.user} left the call`;
        addSystemMessage(leaveMessage);
        handlePeerDisconnected(data.user);
      }
    });

    // Listen to BOTH event names for safety
    const handleMediaStateUpdate = (data) => {
      if (data.user !== username) {
        setPeerMediaStates((prev) => {
          const updated = new Map(prev);
          updated.set(data.user, {
            isMuted: data.isMuted,
            isVideoOff: data.isVideoOff,
          });
          return updated;
        });
      }
    };

    socket.on("media_state_change", handleMediaStateUpdate);
    socket.on("media_state_changed", handleMediaStateUpdate);

    return () => {
      socket.off("receive_message");
      socket.off("incoming_call");
      socket.off("call_accepted");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice_candidate");
      socket.off("call_declined");
      socket.off("call_ended");
      socket.off("user_left_call");
      socket.off("media_state_change");
      socket.off("media_state_changed");
    };
  }, [
    socket,
    room,
    username,
    createPeerConnection,
    handlePeerDisconnected,
    addSystemMessage,
  ]);

  // Fix for local video display - ensures local video stream is properly assigned
  useEffect(() => {
    if (
      localStreamRef.current &&
      localVideoRef.current &&
      callType === "video"
    ) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [inCall, callType]);

  // End call & cleanup if component unmounts
  useEffect(() => {
    const peerConnections = peerConnectionsRef.current;
    const remoteVideos = remoteVideosRef.current;

    return () => {
      // safely clean up using stable references
      Object.values(peerConnections).forEach((pc) => pc.close());
      remoteVideos.forEach((video) => {
        if (video && video.srcObject) {
          video.srcObject.getTracks().forEach((track) => track.stop());
        }
      });
    };
  }, []);

  // Simple emoji handling - only add to input
  const onEmojiClick = (emojiData) => {
    const emoji = emojiData.emoji;
    setCurrentMessage((prev) => {
      const newMessage = prev + emoji;
      // Trigger auto-expand on next render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
          textareaRef.current.style.height = `${newHeight}px`;
        }
      }, 0);
      return newMessage;
    });
    if (textareaRef.current) textareaRef.current.focus();
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-header-left">
          <p>Live Chat - Room {room}</p>
          <p className="user-count">Users: {userCount}</p>
          {inCall && (
            <p className="call-status">
              {callType === "video" ? "VIDEO" : "AUDIO"} {callDuration}
            </p>
          )}
        </div>
        <div className="chat-header-right">
          {/* Only show call buttons if there are other users in the room */}
          {!inCall && userCount > 1 ? (
            <>
              <button
                className="header-btn audio-btn"
                onClick={() => startCall("audio")}
              >
                <img
                  src="https://img.icons8.com/?size=100&id=9730&format=png&color=40C057"
                  alt="Audio"
                  width="20"
                  height="20"
                />
                Audio
              </button>
              <button
                className="header-btn video-btn"
                onClick={() => startCall("video")}
              >
                <img
                  src=" https://img.icons8.com/?size=100&id=11402&format=png&color=228BE6"
                  alt="Video"
                  width="20"
                  height="20"
                />
                Video
              </button>
            </>
          ) : (
            !inCall && (
              <div className="no-call-message">
                Waiting for others to join...
              </div>
            )
          )}
          {inCall && (
            <>
              <button
                className={`control-btn mute-btn ${isMuted ? "muted" : ""}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <img
                  src={
                    isMuted
                      ? "https://img.icons8.com/?size=100&id=9976&format=png&color=FAB005"
                      : "https://img.icons8.com/?size=100&id=8LR9OAENZPeS&format=png&color=FAB005"
                  }
                  alt={isMuted ? "Muted" : "Mic"}
                  width="20"
                  height="20"
                />
              </button>
              {callType === "video" && (
                <button
                  className={`control-btn video-btn ${
                    isVideoOff ? "video-off" : ""
                  }`}
                  onClick={toggleVideo}
                  title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                >
                  <img
                    src={
                      isVideoOff
                        ? "https://img.icons8.com/?size=100&id=10343&format=png&color=228BE6"
                        : "https://img.icons8.com/?size=100&id=11402&format=png&color=228BE6"
                    }
                    alt={isVideoOff ? "Video Off" : "Video"}
                    width="20"
                    height="20"
                  />
                </button>
              )}
              <button className="header-btn end-call-btn" onClick={endCall}>
                <img
                  src="https://img.icons8.com/?size=100&id=20581&format=png&color=FA5252"
                  alt="End Call"
                  width="20"
                  height="20"
                />
                End Call
              </button>
            </>
          )}
          <button className="header-btn logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Video Call Interface */}
      {inCall && (
        <div className="video-call-container">
          {/* Waiting Overlay - Higher Z-index */}
          {connectedPeers.size === 0 && (
            <div className="waiting-overlay">
              <div className="waiting-message">
                <h3>Waiting for others to join...</h3>
                <p>
                  Share room code: <strong>{room}</strong>
                </p>
                <p>Duration: {callDuration}</p>
                <button className="end-waiting-btn" onClick={endCall}>
                  End Call
                </button>
              </div>
            </div>
          )}

          {/* Call Controls Overlay */}
          <div className="call-controls">
            <div className="call-info">
              <span className="call-type-indicator">
                {callType === "video" ? "VIDEO" : "AUDIO"}
              </span>
              <span className="call-duration">{callDuration}</span>
            </div>
            <div className="call-actions">
              <button
                className={`control-btn mute-btn ${isMuted ? "muted" : ""}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <img
                  src={
                    isMuted
                      ? "https://img.icons8.com/?size=100&id=9976&format=png&color=FAB005"
                      : "https://img.icons8.com/?size=100&id=8LR9OAENZPeS&format=png&color=FAB005"
                  }
                  alt={isMuted ? "Muted" : "Mic"}
                  width="24"
                  height="24"
                />
              </button>
              {callType === "video" && (
                <button
                  className={`control-btn video-btn ${
                    isVideoOff ? "video-off" : ""
                  }`}
                  onClick={toggleVideo}
                  title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                >
                  <img
                    src={
                      isVideoOff
                        ? "https://img.icons8.com/?size=100&id=10343&format=png&color=228BE6"
                        : "https://img.icons8.com/?size=100&id=11402&format=png&color=228BE6"
                    }
                    alt={isVideoOff ? "Video Off" : "Video"}
                    width="24"
                    height="24"
                  />
                </button>
              )}
              <button
                className="control-btn end-call-btn"
                onClick={endCall}
                title="End Call"
              >
                <img
                  src="https://img.icons8.com/?size=100&id=20581&format=png&color=FA5252"
                  alt="End Call"
                  width="24"
                  height="24"
                />
              </button>
            </div>
          </div>

          {/* Local Video - Lower Z-index */}
          <div className="local-video">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "200px",
                height: "150px",
                objectFit: "cover",
                display: callType === "video" && !isVideoOff ? "block" : "none",
              }}
            />
            {(callType === "audio" || isVideoOff) && (
              <div className="audio-placeholder local">
                <div className="audio-avatar">
                  <span className="avatar-icon">👤</span>
                </div>
                <div className="user-status">
                  <span className="username">You</span>
                  <div className="status-badges-horizontal">
                    {isMuted && (
                      <span className="status-badge muted">Muted</span>
                    )}
                    {isVideoOff && callType === "video" && (
                      <span className="status-badge video-off">Video Off</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {callType === "video" && !isVideoOff && (
              <div className="video-label">
                <span>You {isMuted ? "(Muted)" : ""}</span>
              </div>
            )}
          </div>

          <div className="remote-videos">
            {Array.from(connectedPeers.entries()).map(([peerId, peerData]) => {
              const peerMediaState = peerMediaStates.get(peerId) || {
                isMuted: false,
                isVideoOff: false,
              };

              return (
                <div key={peerId} className="remote-video">
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideosRef.current.set(peerId, el);
                        if (peerData.stream) {
                          el.srcObject = peerData.stream;
                        }
                      }
                    }}
                    autoPlay
                    playsInline
                    style={{
                      width: "200px",
                      height: "150px",
                      objectFit: "cover",
                      display:
                        callType === "video" && !peerMediaState.isVideoOff
                          ? "block"
                          : "none",
                    }}
                  />
                  {(callType === "audio" || peerMediaState.isVideoOff) && (
                    <div className="audio-placeholder remote">
                      <div className="audio-avatar">
                        <span className="avatar-icon">👤</span>
                      </div>
                      <div className="user-status">
                        <span className="username">{peerId}</span>
                        <div className="status-badges-horizontal">
                          {peerMediaState.isMuted && (
                            <span className="status-badge muted">Muted</span>
                          )}
                          {peerMediaState.isVideoOff &&
                            callType === "video" && (
                              <span className="status-badge video-off">
                                Video Off
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  )}
                  {callType === "video" && !peerMediaState.isVideoOff && (
                    <div className="video-label">
                      <span>
                        {peerId} {peerMediaState.isMuted ? "(Muted)" : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="incoming-call-modal">
          <div className="modal-content">
            <h3>Incoming {incomingCall.callType} call</h3>
            <p>From: {incomingCall.caller}</p>
            <div className="modal-buttons">
              <button
                className="accept-btn"
                onClick={() => joinCall(incomingCall)}
              >
                Accept
              </button>
              <button className="decline-btn" onClick={declineCall}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-body">
        <ScrollToBottom className="message-container">
          {messageList.map((messageContent, index) => (
            <div
              key={index}
              className={`message ${
                messageContent.isSystem
                  ? "system"
                  : username === messageContent.author
                    ? "you"
                    : "other"
              }`}
            >
              <div>
                <div className="message-content">
                  <p>{messageContent.message}</p>
                </div>
                <div className="message-meta">
                  <p>
                    <span className="author">
                      {messageContent.isSystem
                        ? "System"
                        : username === messageContent.author
                          ? "You"
                          : messageContent.author}
                    </span>
                    <span style={{ margin: "0 8px" }}>|</span>
                    <span className="time">
                      {formatTimestamp(messageContent.time)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </ScrollToBottom>
      </div>

      <div className="chat-footer">
        <div className="emoji-section">
          <button
            className="emoji-toggle"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
          >
            😊
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker-container">
              <EmojiPicker
                onEmojiClick={onEmojiClick}
                height={380}
                searchDisabled={true}
                skinTonesDisabled={true}
                previewConfig={{
                  showPreview: true,
                  defaultEmoji: "1f60a",
                  defaultCaption: "Choose an emoji",
                }}
                style={{
                  "--epr-category-label-height": "0px",
                }}
              />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={currentMessage}
          placeholder="Type a message"
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />

        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;
