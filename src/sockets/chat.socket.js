import jwt from "jsonwebtoken";
import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import UserModel from "../models/mysql.model.js";

const onlineUsers = new Map();

export const initChatSocket = (io) => {

  // =========================
  // 🔐 SOCKET AUTH MIDDLEWARE
  // =========================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.user = {
        userId: decoded.userId,
        roleId: decoded.roleId
      };

      next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  // =========================
  // 🔌 SOCKET CONNECTION
  // =========================
  io.on("connection", async (socket) => {
    const { userId, roleId } = socket.user;

    // Fetch user details
    const userData = await UserModel.getUserById(userId);

    socket.user.name = userData
      ? `${userData.first_name} ${userData.last_name}`
      : "User";

    const { name } = socket.user;

    console.log(`🔌 Connected: ${name} (${userId})`);

    // Track online user
    onlineUsers.set(userId, socket.id);

    // =========================
    // 👥 JOIN ROOM
    // =========================
    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId }) => {
      if (!roomId) return;

      socket.join(roomId);

      io.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
        userId,
        name
      });

      console.log(`👥 ${name} joined room ${roomId}`);
    });

    // =========================
    // 📩 SEND MESSAGE
    // =========================
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, (payload) => {
      if (!payload?.roomId || !payload?.message) return;

      io.to(payload.roomId).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
        roomId: payload.roomId,
        message: payload.message,
        senderId: userId,
        senderRoleId: roleId,
        senderName: name,
        createdAt: new Date()
      });
    });

    // =========================
    // ✍️ TYPING INDICATOR
    // =========================
    socket.on(SOCKET_EVENTS.TYPING, ({ roomId, isTyping }) => {
      if (!roomId) return;

      socket.to(roomId).emit(SOCKET_EVENTS.USER_TYPING, {
        userId,
        name,
        isTyping
      });
    });

    // =========================
    // 🚪 LEAVE ROOM
    // =========================
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, ({ roomId }) => {
      if (!roomId) return;

      socket.leave(roomId);

      io.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        userId,
        name
      });

      console.log(`🚪 ${name} left room ${roomId}`);
    });

    // =========================
    // ❌ DISCONNECT
    // =========================
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);

      io.emit(SOCKET_EVENTS.USER_OFFLINE, {
        userId,
        name
      });

      console.log(`❌ Disconnected: ${name} (${userId})`);
    });
  });
};
