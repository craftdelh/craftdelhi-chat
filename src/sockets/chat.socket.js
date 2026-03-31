import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import UserModel from "../models/mysql.model.js";

/**
 * In-memory online users map
 * userId -> socketId
 */
const onlineUsers = new Map();

export const initChatSocket = (io) => {
  io.on("connection", async (socket) => {
    const user = socket.user;

    if (!user) {
      socket.disconnect();
      return;
    }

    const { userId, roleId } = user;

    // 🔹 Fetch name ONCE
    const userData = await UserModel.getUserById(userId);
    const name = userData
      ? `${userData.first_name} ${userData.last_name}`
      : "User";

    socket.user.name = name;

    console.log(`🔌 Socket connected: ${name} (${userId})`);

    // Track online user
    onlineUsers.set(userId, socket.id);

    // 🔹 JOIN ROOM
    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      console.log(`👥 ${name} joined room ${roomId}`);
    });

    // 🔹 SEND MESSAGE
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, (payload) => {
      if (!payload?.roomId || !payload?.message) return;

      io.to(payload.roomId).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
        roomId: payload.roomId,
        message: payload.message,
        messageType: payload.messageType || "TEXT",
        senderId: userId,
        senderRoleId: roleId,
        senderName: name, // 👈 SEND NAME
        createdAt: new Date()
      });
    });

    // 🔹 TYPING INDICATOR
    socket.on(SOCKET_EVENTS.TYPING, ({ roomId, isTyping }) => {
      if (!roomId) return;

      socket.to(roomId).emit(SOCKET_EVENTS.USER_TYPING, {
        roomId,
        userId,
        name,          // 👈 SEND NAME
        isTyping
      });
    });

    // 🔹 LEAVE ROOM
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      console.log(`🚪 ${name} left room ${roomId}`);
    });

    // 🔹 DISCONNECT
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      console.log(`❌ Socket disconnected: ${name} (${userId})`);
    });
  });
};
