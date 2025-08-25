# SpectreLink — Real-Time Chat Application with WebRTC Calling

**SpectreLink** is a comprehensive real-time web-based chat application built using **React**, **Socket.IO**, and **WebRTC**. Users can join rooms using a **username** and **room ID** to engage in text conversations and participate in high-quality video/audio calls. The application features a modern, responsive design with comprehensive calling capabilities.

---

## Features

- **Real-time messaging** with Socket.IO for instant communication
- **Room-based chat system** with unique usernames per room
- **WebRTC video calling** with multi-participant support
- **WebRTC audio calling** for voice-only communication
- **Call controls** including mute/unmute, video toggle, and call duration tracking
- **Emoji picker integration** for enhanced messaging experience
- **Incoming call notifications** with accept/decline functionality
- **User count tracking** for each room with real-time updates
- **Responsive design** optimized for desktop and mobile devices
- **Auto-cleanup** of stale connections and typing indicators
- **Health monitoring** with server status endpoints

---

## How It Works

1. User enters a **username** and **room ID**
2. System validates username uniqueness within the room
3. Users can send real-time messages with emoji support
4. **Audio/Video calls** can be initiated by any participant
5. **Multi-user calls** support multiple participants simultaneously
6. **WebRTC** handles peer-to-peer connections for optimal call quality
7. Users can leave chats and calls at any time with graceful cleanup

---

## Tech Stack

### Frontend
- **React 18** - Modern JavaScript framework
- **Socket.IO Client** - Real-time communication
- **WebRTC API** - Peer-to-peer video/audio calling
- **Emoji Picker React** - Enhanced messaging
- **CSS3** - Responsive styling

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web application framework
- **Socket.IO Server** - Real-time WebSocket communication
- **WebRTC Signaling** - Call establishment and management

---

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager
- Modern web browser with WebRTC support

### Clone the Repository
```bash
git clone https://github.com/GowsiSM/REAL-TIME-CHAT-APPLICATION.git
cd REAL-TIME-CHAT-APPLICATION
```

### Install Dependencies

#### Frontend Dependencies
```bash
cd frontend
npm install react react-dom socket.io-client react-scroll-to-bottom emoji-picker-react @testing-library/react @testing-library/jest-dom react-scripts
```

#### Backend Dependencies
```bash
cd server
npm install express socket.io cors
```

#### Root Dependencies
```bash
npm install
```

### Alternative Installation (Using Dependencies File)
```bash
# If you have a dependencies_to_install.txt file
npm install $(cat dependencies_to_install.txt)
```

---

## Running the Application

### Start Backend Server
```bash
cd server
node index.js
```
Server runs on `http://localhost:3001`

### Start Frontend Development Server
```bash
cd frontend
npm start
```
React app runs on `http://localhost:3000`

### Access Application
Navigate to `http://localhost:3000` in your web browser

---

## Usage Guide

### Joining a Room
1. Enter your desired **username**
2. Enter a **room ID** (any string)
3. Click **"Join Room"**
4. System validates username uniqueness within the room

### Text Messaging
- Type messages in the input field
- Press **Enter** or click **"Send"**
- Use the emoji button for emoji selection
- See real-time user count and typing indicators

### Voice/Video Calls
- Click **"Audio"** for voice-only calls
- Click **"Video"** for video calls with camera
- **Accept/Decline** incoming calls from other room members
- Use **call controls** during active calls:
  - Mute/unmute microphone
  - Toggle video on/off
  - End call
  - View call duration

### Multi-Participant Calls
- Multiple users can join the same call
- Video grid layout for multiple participants
- Individual audio/video controls for each participant

---

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, active rooms, total users, and active calls.

### Room Statistics
```
GET /rooms/stats
```
Returns detailed room statistics including user counts and call information.

---

## WebRTC Configuration

The application uses Google STUN servers for NAT traversal:

```javascript
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};
```

For production environments with complex firewall configurations, consider implementing TURN servers.

---

## Project Structure

```
REAL-TIME-CHAT-APPLICATION/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── favicon.ico
│   │   └── manifest.json
│   ├── src/
│   │   ├── App.js          # Main application component
│   │   ├── App.css         # Application styles
│   │   ├── Chat.js         # Chat component with WebRTC
│   │   ├── Chat.css        # Chat-specific styles
│   │   └── index.js        # Application entry point
│   └── package.json        # Frontend dependencies
├── server/
│   ├── index.js            # Socket.IO and Express server
│   └── package.json        # Backend dependencies
├── Dependencies_to_install.txt  # Dependency list
├── README.md               # Project documentation
└── package.json            # Root package configuration
```

---

## Key Features Explained

### Room Management
- **Username validation** prevents duplicates within rooms
- **Real-time user tracking** with automatic cleanup
- **Room statistics** and monitoring capabilities
- **Graceful disconnect handling**

### WebRTC Implementation
- **Peer-to-peer connections** for optimal call quality
- **ICE candidate exchange** through Socket.IO signaling
- **Multi-stream support** for group calling
- **Fallback handling** for connection failures

### Call Features
- **Call state management** (idle, calling, in-call)
- **Media controls** with real-time feedback
- **Call duration tracking** with formatted display
- **Incoming call UI** with accept/decline options

---

## Browser Compatibility

Supports modern browsers with WebRTC capabilities:
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

**Note:** HTTPS is required for WebRTC in production environments.

---

## Security Considerations

### Development
- Currently configured for HTTP development environment
- Uses localhost connections for testing

### Production Recommendations
- **Enable HTTPS** (required for WebRTC)
- **Implement authentication** for user verification
- **Add rate limiting** for message and call requests
- **Input validation** and sanitization
- **TURN server configuration** for enterprise firewalls

---

## Troubleshooting

### Common Issues

**"Username already taken" Error**
- Each username must be unique within a room
- Try a different username or join a different room

**Camera/Microphone Access Denied**
- Check browser permissions in settings
- Ensure HTTPS in production deployment
- Reload page and grant permissions

**Call Connection Issues**
- Verify both frontend and backend servers are running
- Check WebRTC browser support
- Review browser console for error messages

**Message Not Sending**
- Ensure Socket.IO connection is established
- Check network connectivity
- Verify server is running on correct port

---

## Development

### Running in Development Mode
```bash
# Terminal 1: Backend
cd server && npm start

# Terminal 2: Frontend  
cd frontend && npm start
```

### Building for Production
```bash
cd frontend
npm run build
```
