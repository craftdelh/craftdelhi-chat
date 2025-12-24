import "./config/env.js";
import http from "http";
import app from "./app.js";
import { Server } from "socket.io";
import { socketConfig } from "./config/socket.js";
import { connectDB } from "./config/database.js";
import { initChatSocket } from "./sockets/chat.socket.js";
import jwt from "jsonwebtoken";
import "./config/mysql.js";

const server = http.createServer(app);

const io = new Server(server, socketConfig);

// 🔐 SOCKET AUTH
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error("No token");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = {
      userId: String(decoded.id),
      roleId: decoded.role
    };

    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

initChatSocket(io);

connectDB();

server.listen(process.env.PORT, () => {
  console.log(`🚀 Chat service running on port ${process.env.PORT}`);
});
