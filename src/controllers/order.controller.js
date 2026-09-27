import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import UserModel from "../models/mysql.model.js";
import { encryptText, decryptText } from "../utils/encryption.js";
import { uploadFileToS3 } from "../services/s3.service.js";
import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import { getIO } from "../sockets/chat.socket.js";
import { ROLES } from "../constants/roles.js";
import { chooseOrderRoom, getOrderContextIds } from "../utils/orderRoom.js";

const findOrderRoom = async (orderId) => {
  const rooms = await Room.find({
    contextType: "ORDER",
    contextId: { $in: getOrderContextIds(orderId) }
  });

  if (rooms.length <= 1) return rooms[0] || null;

  const latestMessage = await Message.findOne({
    roomId: { $in: rooms.map(room => room._id) }
  })
    .sort({ createdAt: -1 })
    .select("roomId");

  return chooseOrderRoom(rooms, latestMessage?.roomId);
};

class OrderController {

  static async getOrders(req, res) {
    try {
      const { userId, roleId } = req.user;
      const orders = await UserModel.getOrdersForUser(userId, roleId);
      return res.status(200).json({ success: true, data: orders });
    } catch (error) {
      console.error("getOrders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }
  }

  static async getOrderDetails(req, res) {
    try {
      const { id } = req.params;
      const { userId, roleId } = req.user;

      const order = await UserModel.getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isBuyer = String(order.user_id) === String(userId);
      const isSeller = String(order.seller_id) === String(userId);
      const isAdmin = Number(roleId) === ROLES.ADMIN;

      if (!isBuyer && !isSeller && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to access this order" });
      }

      return res.status(200).json({ success: true, data: order });
    } catch (error) {
      console.error("getOrderDetails error:", error);
      return res.status(500).json({ message: "Failed to fetch order details" });
    }
  }

  static async getOrderChat(req, res) {
    try {
      const { id } = req.params;
      const { userId, roleId } = req.user;

      const order = await UserModel.getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isBuyer = String(order.user_id) === String(userId);
      const isSeller = String(order.seller_id) === String(userId);
      const isAdmin = Number(roleId) === ROLES.ADMIN;

      if (!isBuyer && !isSeller && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to access this order chat" });
      }

      const contextId = `ORDER_${id}`;
      let room = await findOrderRoom(id);

      if (!room) {
        room = await Room.create({
          contextType: "ORDER",
          contextId,
          participants: [
            { userId: String(order.user_id), roleId: ROLES.BUYER },
            { userId: String(order.seller_id), roleId: ROLES.SELLER }
          ]
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          roomId: room._id,
          room
        }
      });
    } catch (error) {
      console.error("getOrderChat error:", error);
      return res.status(500).json({ message: "Failed to get order chat" });
    }
  }

  static async getOrderMessages(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const { userId, roleId } = req.user;

      const room = await findOrderRoom(id);

      if (!room) {
        return res.status(404).json({ message: "Order room not found" });
      }

      const isParticipant = room.participants.some(p => String(p.userId) === String(userId)) || Number(roleId) === ROLES.ADMIN;
      if (!isParticipant) {
        return res.status(403).json({ message: "Not authorized for this order chat" });
      }

      const messages = await Message.find({ roomId: room._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const senderIds = [...new Set(messages.map(m => m.senderId))];
      const users = await UserModel.getUsersByIds(senderIds);
      const userMap = {};
      users.forEach(u => {
        userMap[u.id] = `${u.first_name} ${u.last_name}`;
      });

      const enrichedMessages = messages.map(msg => ({
        ...msg.toObject(),
        message: decryptText(msg.message),
        senderName: userMap[msg.senderId] || "User"
      }));

      return res.status(200).json({ success: true, data: enrichedMessages });
    } catch (error) {
      console.error("getOrderMessages error:", error);
      return res.status(500).json({ message: "Failed to fetch order messages" });
    }
  }

  static async sendOrderMessage(req, res) {
    try {
      const { id } = req.params;
      let { message, messageType = "TEXT" } = req.body;
      const { userId, roleId } = req.user;

      let room = await findOrderRoom(id);

      if (!room) {
        return res.status(404).json({ message: "Order chat room not found" });
      }

      const isParticipant = room.participants.some(p => String(p.userId) === String(userId)) || Number(roleId) === ROLES.ADMIN;
      if (!isParticipant) {
        return res.status(403).json({ message: "Not authorized to send messages in this order chat" });
      }

      const file = req.files && req.files.length > 0 ? req.files[0] : req.file;
      if (file) {
        const fileUrl = await uploadFileToS3(file.buffer, file.originalname, file.mimetype);
        message = fileUrl;
        if (!req.body.messageType) {
          if (file.mimetype.startsWith("image/")) messageType = "IMAGE";
          else if (file.mimetype.startsWith("video/")) messageType = "VIDEO";
          else if (file.mimetype === "application/pdf") messageType = "PDF";
          else messageType = "FILE";
        }
      }

      if (!message) {
        return res.status(400).json({ message: "message text or file is required" });
      }

      const encryptedMessage = encryptText(message);
      const msg = await Message.create({
        roomId: room._id,
        senderId: String(userId),
        senderRoleId: Number(roleId),
        message: encryptedMessage,
        messageType
      });

      room.lastMessage = message;
      room.lastMessageAt = new Date();
      await room.save();

      const io = getIO();
      if (io) {
        io.to(String(room._id)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
          roomId: String(room._id),
          message,
          messageType,
          senderId: String(userId),
          senderRoleId: Number(roleId),
          createdAt: new Date()
        });
      }

      return res.status(200).json({
        success: true,
        message: "Order message sent",
        data: msg
      });
    } catch (error) {
      console.error("sendOrderMessage error:", error);
      return res.status(500).json({ message: "Failed to send order message" });
    }
  }

  static async markOrderMessagesRead(req, res) {
    try {
      const { id } = req.params;
      const { userId, roleId } = req.user;

      const room = await findOrderRoom(id);

      if (!room) {
        return res.status(404).json({ message: "Order chat room not found" });
      }

      const isParticipant = room.participants.some(
        p => String(p.userId) === String(userId)
      ) || Number(roleId) === ROLES.ADMIN;
      if (!isParticipant) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await Message.updateMany(
        { roomId: room._id, senderId: { $ne: String(userId) }, readBy: { $ne: String(userId) } },
        { $push: { readBy: String(userId) } }
      );

      return res.status(200).json({
        success: true,
        message: "Order messages marked as read"
      });
    } catch (error) {
      console.error("markOrderMessagesRead error:", error);
      return res.status(500).json({ message: "Failed to mark order messages read" });
    }
  }

}

export default OrderController;
