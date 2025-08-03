# SpectreLink — Anonymous Room-Based Chat

**SpectreLink** is a real-time, anonymous web-based chat application built using **React** and **Socket.IO**. Users can join any room using just a **nickname** and a **room number**. Once inside, all participants in the same room can chat with each other — but no names are revealed. Conversations are temporary, secure, and leave no trace once users leave.

---

## 🚀 Features

- 🔐 Anonymous communication — users only identify themselves by room number
- 💬 Real-time chat via **Socket.IO**
- 🧑‍🤝‍🧑 Multiple users can join the same room and chat simultaneously
- 🚪 Users can leave or logout at any time
- 🌙 Fully responsive UI with dark theme
- 😀 Emoji support for more expressive conversations
- 🎮 Game-inspired design theme for a modern experience

---

## 🧠 How It Works

1. User enters a **nickname** (not shown to others) and a **room number**
2. They’re logged into the specified room
3. Anyone joining with the **same room number** enters the same chat
4. Messages appear anonymously — no usernames or identifiers shown
5. Users can leave the chat at any time

---

## 🛠️ Tech Stack

- **Frontend:** React, Tailwind CSS / CSS Modules
- **Real-time Backend:** Socket.IO
- **Server Runtime:** Node.js (for Socket.IO server)

---

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   https://github.com/GowsiSM/REAL-TIME-CHAT-APPLICATION.git
   ```
2. **Install the dependencies:**
   ```bash
   npm install $(cat dependencies_to_install.txt)
   ```
