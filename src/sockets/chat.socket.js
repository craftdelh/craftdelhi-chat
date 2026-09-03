import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import UserModel from "../models/mysql.model.js";
import { decryptText, encryptText } from "../utils/encryption.js";
import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
/**
 * In-memory online users map
 * userId -> socketId
 */
const onlineUsers = new Map();
let ioInstance = null;

export const getIO = () => ioInstance;

export const initChatSocket = (io) => {
  ioInstance = io;

  const emitUnseenCount = async (userId) => {
    try {
      const rooms = await Room.find({ "participants.userId": userId });
      const roomIds = rooms.map((r) => r._id);

      const matchCriteria = {
        roomId: { $in: roomIds },
        senderId: { $ne: String(userId) },
        readBy: { $ne: String(userId) }
      };

      const totalUnseen = await Message.countDocuments(matchCriteria);

      const roomCounts = await Message.aggregate([
        { $match: matchCriteria },
        { $group: { _id: "$roomId", count: { $sum: 1 } } }
      ]);

      const countsByRoom = {};
      roomCounts.forEach((item) => {
        countsByRoom[item._id] = item.count;
      });

      const socketId = onlineUsers.get(userId);
      if (socketId) {
        io.to(socketId).emit(SOCKET_EVENTS.UNSEEN_COUNT_UPDATED, {
          totalUnseen,
          countsByRoom
        });
      }
    } catch (err) {
      console.error("Error emitting unseen count:", err);
    }
  };

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
      
      // Send initial unseen count on join
      emitUnseenCount(userId);
    });

    // 🔹 SEND MESSAGE
    socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (payload) => {
      if (!payload?.roomId || !payload?.message) return;

      let finalMessage = payload.message;

      try {
        finalMessage = decryptText(payload.message);
      } catch (err) {
        finalMessage = payload.message;
      }

      // If message needs to be saved to DB from socket
      if (!payload.isSaved) {
        try {
          const room = await Room.findById(payload.roomId);
          if (room) {
             await Message.create({
               roomId: payload.roomId,
               senderId: userId,
               senderRoleId: roleId,
               message: encryptText(finalMessage),
               messageType: payload.messageType || "TEXT"
             });
             room.lastMessage = finalMessage;
             room.lastMessageAt = new Date();
             await room.save();
          }
        } catch (dbErr) {
          console.error("Error saving socket msg DB:", dbErr);
        }
      }

      io.to(payload.roomId).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
        roomId: payload.roomId,
        message: finalMessage, // ✅ ALWAYS readable
        messageType: payload.messageType || "TEXT",
        senderId: userId,
        senderRoleId: roleId,
        senderName: name,
        createdAt: new Date()
      });

      // Update unseen counts for other participants
      try {
        const room = await Room.findById(payload.roomId);
        if (room) {
          for (const p of room.participants) {
            if (String(p.userId) !== String(userId)) {
              emitUnseenCount(p.userId);
            }
          }
        }
      } catch (e) {
        console.error("Error updating counts on send:", e);
      }
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

    // 🔹 MARK ROOM AS READ
    socket.on(SOCKET_EVENTS.MARK_ROOM_READ, async ({ roomId }) => {
      if (!roomId) return;
      try {
        await Message.updateMany(
          { roomId, senderId: { $ne: String(userId) }, readBy: { $ne: String(userId) } },
          { $push: { readBy: String(userId) } }
        );
        emitUnseenCount(userId);
      } catch (err) {
        console.error("Error marking room read:", err);
      }
    });

    // 🔹 GET UNSEEN COUNT
    socket.on(SOCKET_EVENTS.GET_UNSEEN_COUNT, () => {
      emitUnseenCount(userId);
    });

    // 🔹 DISCONNECT
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      console.log(`❌ Socket disconnected: ${name} (${userId})`);
    });
  });
};
