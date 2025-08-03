// Chat.js
import React, { useState, useEffect, useRef } from "react";
import ScrollToBottom from "react-scroll-to-bottom";
import EmojiPicker from "emoji-picker-react";
import "./Chat.css";

function Chat({ socket, username, room, userCount, onLogout }) {
     const [currentMessage, setCurrentMessage] = useState("");
     const [messageList, setMessageList] = useState([]);
     const [showEmojiPicker, setShowEmojiPicker] = useState(false);

     const inputRef = useRef(null);

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

     const handleLogout = () => {
          // Close emoji picker if open
          setShowEmojiPicker(false);
          
          // Disconnect from socket
          socket.disconnect();
          
          // Call the logout function passed from parent
          onLogout();
     };

     useEffect(() => {
          socket.off("receive_message").on("receive_message", (data) => {
               setMessageList((list) => [...list, data]);
          });

          return () => {
               socket.off("receive_message");
          };
     }, [socket]);

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
                    </div>
                    <div className="chat-header-right">
                         <button className="logout-button" onClick={handleLogout}>
                              Logout
                         </button>
                    </div>
               </div>

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