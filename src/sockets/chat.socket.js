import { SOCKET_EVENTS } from "../constants/socketEvents.js";

/**
 * In-memory online users map
 * userId -> socketId
 */
const onlineUsers = new Map();

export const initChatSocket = (io) => {
  io.on("connection", (socket) => {
    const user = socket.user;

    if (!user) {
      socket.disconnect();
      return;
    }

    const { userId, roleId } = user;

    console.log(`🔌 Socket connected: ${userId} (role ${roleId})`);

    // Track online user
    onlineUsers.set(userId, socket.id);

    // 🔹 JOIN ROOM
    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      console.log(`👥 User ${userId} joined room ${roomId}`);
    });

    // 🔹 SEND MESSAGE (real-time only, persistence handled in service/controller)
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, (payload) => {
      /**
       * payload = {
       *   roomId,
       *   message,
       *   messageType
       * }
       */
      if (!payload?.roomId || !payload?.message) return;

      io.to(payload.roomId).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
        roomId: payload.roomId,
        message: payload.message,
        senderId: userId,
        senderRoleId: roleId,
        createdAt: new Date()
      });
    });

    // 🔹 TYPING INDICATOR
    socket.on(SOCKET_EVENTS.TYPING, ({ roomId, isTyping }) => {
      if (!roomId) return;

      socket.to(roomId).emit(SOCKET_EVENTS.USER_TYPING, {
        userId,
        isTyping
      });
    });

    // 🔹 LEAVE ROOM
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      console.log(`🚪 User ${userId} left room ${roomId}`);
    });

    // 🔹 DISCONNECT
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      console.log(`❌ Socket disconnected: ${userId}`);
    });
  });
};
