// Chat.js - Fixed with Mute/Unmute, Call Timer, and Video Controls
import React, { useState, useEffect, useRef, useCallback } from "react";
import ScrollToBottom from "react-scroll-to-bottom";
import EmojiPicker from "emoji-picker-react";
import "./Chat.css";

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
  
  // Refs
  const inputRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const callTimerRef = useRef(null);

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  // Update call timer
  useEffect(() => {
    if (inCall && callStartTime) {
      callTimerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        setCallDuration(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
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
        time: new Date(Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      await socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setCurrentMessage("");
      setShowEmojiPicker(false);
    }
  };

  // Toggle mute/unmute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Toggle video on/off
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current && callType === 'video') {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  }, [isVideoOff, callType]);

  // Memoized function to handle peer disconnection
  const handlePeerDisconnected = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    
    remoteVideosRef.current.delete(peerId);
    setConnectedPeers(prev => {
      const updated = new Map(prev);
      updated.delete(peerId);
      return updated;
    });
    
    // Only end call if no peers left AND we're still in call
    if (inCall && peerConnectionsRef.current.size === 0) {
      // Don't emit end_call again, just clean up locally
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      setInCall(false);
      setCallType(null);
      setConnectedPeers(new Map());
      setCallStartTime(null);
      setIsMuted(false);
      setIsVideoOff(false);
    }
  }, [inCall]);

  // Memoized function to create peer connection
  const createPeerConnection = useCallback((peerId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${peerId}:`, event.candidate);
        socket.emit("ice_candidate", {
          room,
          peerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Received remote stream from ${peerId}:`, event.streams);
      const [remoteStream] = event.streams;
      
      // Update connected peers
      setConnectedPeers(prev => {
        const updated = new Map(prev);
        updated.set(peerId, { stream: remoteStream });
        return updated;
      });
      
      // Set video element source
      setTimeout(() => {
        const videoElement = remoteVideosRef.current.get(peerId);
        if (videoElement && remoteStream) {
          videoElement.srcObject = remoteStream;
          console.log(`Set remote video for ${peerId}`);
        }
      }, 100);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        handlePeerDisconnected(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${peerId}:`, pc.connectionState);
    };

    return pc;
  }, [room, socket, handlePeerDisconnected]);

  // Memoized function to end call
  const endCall = useCallback(() => {
    // Prevent multiple calls to endCall
    if (!inCall) return;
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, peerId) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Clear remote videos
    remoteVideosRef.current.clear();

    // Update state first
    setInCall(false);
    setCallType(null);
    setConnectedPeers(new Map());
    setCallStartTime(null);
    setIsMuted(false);
    setIsVideoOff(false);

    // Only emit if we were actually in a call
    socket.emit("end_call", { room, user: username });
  }, [inCall, room, socket, username]);

  const handleLogout = useCallback(() => {
    setShowEmojiPicker(false);
    
    // End any active calls
    if (inCall) {
      endCall();
    }
    
    socket.disconnect();
    onLogout();
  }, [inCall, endCall, socket, onLogout]);

  // WebRTC Functions
  const getUserMedia = async (video = false) => {
    try {
      const constraints = {
        audio: true,
        video: video ? { width: 640, height: 480 } : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
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
      console.log(`Starting ${type} call...`);
      const stream = await getUserMedia(type === 'video');
      setCallType(type);
      setInCall(true);
      setCallStartTime(Date.now());
      setIsMuted(false);
      setIsVideoOff(false);
      
      console.log(`Got local stream:`, stream);
      
      // Emit call start to other users in room
      socket.emit("start_call", {
        room,
        callType: type,
        caller: username
      });

    } catch (error) {
      console.error("Error starting call:", error);
      alert("Could not access camera/microphone");
    }
  };

  const joinCall = async (callData) => {
    try {
      console.log(`Joining ${callData.callType} call with ${callData.caller}...`);
      const stream = await getUserMedia(callData.callType === 'video');
      setCallType(callData.callType);
      setInCall(true);
      setIncomingCall(null);
      setCallStartTime(Date.now());
      setIsMuted(false);
      setIsVideoOff(false);

      console.log(`Got local stream for joining:`, stream);

      socket.emit("join_call", {
        room,
        caller: callData.caller,
        joiner: username
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

    // Add listeners
    socket.on("receive_message", (data) => {
      setMessageList((list) => [...list, data]);
    });

    // WebRTC signaling events
    socket.on("incoming_call", (callData) => {
      setIncomingCall(callData);
    });

    socket.on("call_accepted", async (data) => {
      console.log(`Call accepted by ${data.joiner}`);
      const pc = createPeerConnection(data.joiner);
      peerConnectionsRef.current.set(data.joiner, pc);
      
      if (localStreamRef.current) {
        console.log(`Adding local tracks to peer connection for ${data.joiner}`);
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`Sending offer to ${data.joiner}:`, offer);
        
        socket.emit("offer", {
          room,
          peerId: data.joiner,
          offer
        });
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    });

    socket.on("offer", async (data) => {
      console.log(`Received offer from ${data.peerId}:`, data.offer);
      
      // Create peer connection if it doesn't exist
      if (!peerConnectionsRef.current.has(data.peerId)) {
        const pc = createPeerConnection(data.peerId);
        peerConnectionsRef.current.set(data.peerId, pc);
        
        // Add local stream tracks
        if (localStreamRef.current) {
          console.log(`Adding local tracks to peer connection for ${data.peerId}`);
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
          console.log(`Sending answer to ${data.peerId}:`, answer);
          
          socket.emit("answer", {
            room,
            peerId: data.peerId,
            answer
          });
        } catch (error) {
          console.error("Error handling offer:", error);
        }
      }
    });

    socket.on("answer", async (data) => {
      console.log(`Received answer from ${data.peerId}:`, data.answer);
      const pc = peerConnectionsRef.current.get(data.peerId);
      if (pc) {
        try {
          await pc.setRemoteDescription(data.answer);
          console.log(`Set remote description for ${data.peerId}`);
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    socket.on("ice_candidate", async (data) => {
      console.log(`Received ICE candidate from ${data.peerId}:`, data.candidate);
      const pc = peerConnectionsRef.current.get(data.peerId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(data.candidate);
          console.log(`Added ICE candidate from ${data.peerId}`);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      } else {
        console.warn(`Cannot add ICE candidate from ${data.peerId} - no remote description`);
      }
    });

    socket.on("call_declined", () => {
      setIncomingCall(null);
    });

    socket.on("call_ended", (data) => {
      if (data.user !== username) {
        handlePeerDisconnected(data.user);
      }
    });

    socket.on("user_left_call", (data) => {
      if (data.user !== username) {
        handlePeerDisconnected(data.user);
      }
    });

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
    };
  }, [socket, room, username, createPeerConnection, handlePeerDisconnected]);

  const onEmojiClick = (emojiData) => {
    const emoji = emojiData.emoji;
    setCurrentMessage((prev) => prev + emoji);
    inputRef.current.focus();
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-header-left">
          <p>Live Chat - Room {room}</p>
          <p className="user-count">Users: {userCount}</p>
          {inCall && (
            <p className="call-status">
              {callType === 'video' ? '📹' : '📞'} {callType} call active - {callDuration}
            </p>
          )}
        </div>
        <div className="chat-header-right">
          {!inCall ? (
            <>
              <button className="call-button audio-btn" onClick={() => startCall('audio')}>
                📞 Audio
              </button>
              <button className="call-button video-btn" onClick={() => startCall('video')}>
                📹 Video
              </button>
            </>
          ) : (
            <>
              <button 
                className={`control-btn mute-btn ${isMuted ? 'muted' : ''}`} 
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>
              {callType === 'video' && (
                <button 
                  className={`control-btn video-btn ${isVideoOff ? 'video-off' : ''}`} 
                  onClick={toggleVideo}
                  title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                >
                  {isVideoOff ? '📹❌' : '📹'}
                </button>
              )}
              <button className="end-call-button" onClick={endCall}>
                📞 End Call
              </button>
            </>
          )}
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Video Call Interface */}
      {inCall && (
        <div className="video-call-container">
          {/* Call Controls Overlay */}
          <div className="call-controls">
            <div className="call-info">
              <span className="call-type-indicator">
                {callType === 'video' ? '📹' : '📞'} {callType.toUpperCase()}
              </span>
              <span className="call-duration">{callDuration}</span>
            </div>
            <div className="call-actions">
              <button 
                className={`control-btn mute-btn ${isMuted ? 'muted' : ''}`} 
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>
              {callType === 'video' && (
                <button 
                  className={`control-btn video-btn ${isVideoOff ? 'video-off' : ''}`} 
                  onClick={toggleVideo}
                  title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                >
                  {isVideoOff ? '📹❌' : '📹'}
                </button>
              )}
              <button className="control-btn end-call-btn" onClick={endCall} title="End Call">
                📞
              </button>
            </div>
          </div>

          <div className="local-video">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ 
                width: '200px', 
                height: '150px', 
                objectFit: 'cover',
                display: callType === 'video' && !isVideoOff ? 'block' : 'none'
              }}
            />
            {callType === 'audio' || isVideoOff ? (
              <div className="audio-placeholder">
                <div className="audio-avatar">
                  {isMuted ? '🔇' : '🎤'}
                </div>
              </div>
            ) : null}
            <span>You {isMuted ? '(Muted)' : ''}</span>
            {/* Quick End Call Button on Local Video */}
            <button className="local-video-end-btn" onClick={endCall} title="End Call">
              ✕
            </button>
          </div>
          
          <div className="remote-videos">
            {Array.from(connectedPeers.entries()).map(([peerId, peerData]) => (
              <div key={peerId} className="remote-video">
                <video
                  ref={el => {
                    if (el) {
                      remoteVideosRef.current.set(peerId, el);
                      // Set stream if available
                      if (peerData.stream) {
                        el.srcObject = peerData.stream;
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  style={{ 
                    width: '200px', 
                    height: '150px', 
                    objectFit: 'cover',
                    display: callType === 'video' ? 'block' : 'none'
                  }}
                />
                {callType === 'audio' && (
                  <div className="audio-placeholder remote">
                    <div className="audio-avatar">
                      👤
                    </div>
                  </div>
                )}
                <span>{peerId}</span>
              </div>
            ))}
            
            {/* No Participants Message */}
            {connectedPeers.size === 0 && (
              <div className="no-participants">
                <div className="waiting-message">
                  <h3>Waiting for others to join...</h3>
                  <p>Share the room code with others to start the call</p>
                  <p>Call duration: {callDuration}</p>
                  <button className="end-waiting-btn" onClick={endCall}>
                    End Call
                  </button>
                </div>
              </div>
            )}
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
              <button className="accept-btn" onClick={() => joinCall(incomingCall)}>
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
              className={`message ${username === messageContent.author ? "you" : "other"}`}
            >
              <div>
                <div className="message-content">
                  <p>{messageContent.message}</p>
                </div>
                <div className="message-meta">
                  <p>
                    <span className="author">
                      {username === messageContent.author ? "You" : messageContent.author}
                    </span>
                    <span style={{ margin: "0 8px" }}>|</span>
                    <span className="time">{messageContent.time}</span>
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
                  defaultCaption: "Choose an emoji"
                }}
              />
            </div>
          )}
        </div>

        <input
          type="text"
          ref={inputRef}
          value={currentMessage}
          placeholder="Type a message"
          onChange={(e) => setCurrentMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />

        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;