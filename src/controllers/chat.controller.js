import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import { encryptText } from "../utils/encryption.js";
import { decryptText } from "../utils/encryption.js";


class ChatController {

  // POST /chat/room
  static async createRoom(req, res) {
    try {
      const { contextType, contextId, participants } = req.body;

      if (!contextType || !participants?.length) {
        return res.status(400).json({ message: "Invalid payload" });
      }

      // Try to find existing room
      let room = await Room.findOne({
        contextType,
        contextId,
        "participants.userId": { $all: participants.map(p => p.userId) }
      });

      if (!room) {
        room = await Room.create({
          contextType,
          contextId,
          participants
        });
      }

      return res.status(200).json({ roomId: room._id });
    } catch (error) {
      console.error("createRoom error:", error);
      return res.status(500).json({ message: "Failed to create room" });
    }
  }

  // GET /chat/rooms/:userId
  static async getUserRooms(req, res) {
    try {
      const { userId } = req.params;

      const rooms = await Room.find({
        "participants.userId": userId
      }).sort({ updatedAt: -1 });

      return res.status(200).json({ data: rooms });
    } catch (error) {
      console.error("getUserRooms error:", error);
      return res.status(500).json({ message: "Failed to fetch rooms" });
    }
  }

  // GET /chat/messages?roomId=
  static async getMessages(req, res) {
    try {
      const { roomId, page = 1, limit = 20 } = req.query;

      if (!roomId) {
        return res.status(400).json({ message: "roomId is required" });
      }

      const messages = await Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));
        
        const decryptedMessages = messages.map(msg => ({
          ...msg.toObject(),
          message: decryptText(msg.message)
        }));

        return res.status(200).json({ data: decryptedMessages });
    } catch (error) {
      console.error("getMessages error:", error);
      return res.status(500).json({ message: "Failed to fetch messages" });
    }
  }
  static async sendMessage(req, res) {
    try {
      const { roomId, message } = req.body;
      const { userId, roleId } = req.user;

      if (!roomId || !message) {
        return res.status(400).json({ message: "roomId and message are required" });
      }

      // 1️⃣ Check room exists
      const room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      // 2️⃣ Check user is participant
      const isParticipant = room.participants.some(
        p => p.userId === userId
      );

      if (!isParticipant) {
        return res.status(403).json({ message: "You are not part of this room" });
      }

      // 3️⃣ Save message
      const encryptedMessage = encryptText(message);

      const msg = await Message.create({
        roomId,
        senderId: userId,
        senderRoleId: roleId,
        message: encryptedMessage
      });

      // 4️⃣ Update room last message
      room.lastMessage = message;
      room.lastMessageAt = new Date();
      await room.save();

      return res.status(200).json({
        success: true,
        message: "Message sent",
        data: msg
      });

    } catch (error) {
      console.error("sendMessage error:", error);
      return res.status(500).json({ message: "Failed to send message" });
    }
  }

}

export default ChatController;
