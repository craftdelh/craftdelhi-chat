import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import { encryptText } from "../utils/encryption.js";
import { decryptText } from "../utils/encryption.js";
import { ROLES } from "../constants/roles.js";
import UserModel from "../models/mysql.model.js"; // MySQL


class ChatController {

  static async createRoom(req, res) {
    try {
      const { contextType } = req.body;
      let { contextId } = req.body;
      const authUser = req.user; // from JWT


      if (!contextType) {
        return res.status(400).json({ message: "contextType is required" });
      }

      // ✅ Auto-set contextId for GENERAL
      if (contextType === "GENERAL") {
        contextId = "ADMIN_SUPPORT";
      }

      let participants = [];
      if (contextType === "GENERAL") {

        const admin = await UserModel.getDefaultAdmin();

        if (!admin) {
          return res.status(404).json({ message: "Admin not found" });
        }

        participants = [
          { userId: admin.id, roleId: ROLES.ADMIN },
          { userId: authUser.userId, roleId: authUser.roleId }
        ];
      }

      if (contextType === "PRODUCT") {

        const product = await UserModel.getSellerByContext(contextType,contextId);

        if (!product?.seller_id) {
          return res.status(404).json({ message: "Product not found" });
        }
        if (product.seller_id === authUser.id) {
              return res.status(400).json({ message: "Cannot chat with yourself" });
        }

        participants = [
          { userId: product.seller_id, roleId: ROLES.SELLER },
          { userId: authUser.userId, roleId: ROLES.BUYER }
        ];
      }
      if (contextType === "ORDER") {

        const order = await UserModel.getSellerByContext(contextType,contextId);

        if (!order?.seller_id) {
          return res.status(404).json({ message: "order not found" });
        }
        if (order.seller_id === authUser.id) {
          return res.status(400).json({ message: "Cannot chat with yourself" });
        }

        participants = [
          { userId: order.seller_id, roleId: ROLES.SELLER },
          { userId: authUser.userId, roleId: ROLES.BUYER }
        ];
      }

      if (!participants.length) {
        return res.status(400).json({ message: "Invalid context type" });
      }
      let room = await Room.findOne({
        contextType,
        contextId,
          participants: {
            $size: participants.length,
            $all: participants.map(p => ({ userId: p.userId }))
          }
      });

      if (!room) {
        room = await Room.create({
          contextType,
          contextId,
          participants
        });
      }

      return res.status(200).json({
        roomId: room._id,
        participants
      });

    } catch (error) {
      console.error("createRoom error:", error);
      return res.status(500).json({ message: "Failed to create room" });
    }
  }

  static async getUserRooms(req, res) {
    try {
      const { userId } = req.params;

      // 1️⃣ Fetch rooms
      const rooms = await Room.find({
        "participants.userId": userId
      }).sort({ updatedAt: -1 });

      if (!rooms.length) {
        return res.status(200).json({ data: [] });
      }

      // 2️⃣ Collect IDs
      const userIds = new Set();
      const productIds = new Set();
      const orderIds = new Set();

      rooms.forEach(room => {
        room.participants.forEach(p => userIds.add(p.userId));

        if (room.contextType === "PRODUCT") {
          productIds.add(room.contextId);
        }

        if (room.contextType === "ORDER") {
          orderIds.add(room.contextId);
        }
      });

      // 3️⃣ Fetch MySQL data
      const [users, products, orders] = await Promise.all([
        UserModel.getUsersByIds([...userIds]),
        UserModel.getProductsByIds([...productIds]),
        UserModel.getOrdersByIds([...orderIds])
      ]);

      // 4️⃣ Maps
      const userMap = {};
      users.forEach(u => {
        userMap[u.id] = `${u.first_name} ${u.last_name}`;
      });

      const productMap = {};
      products.forEach(p => {
        productMap[p.id] = p.name;
      });

      const orderMap = {};
      orders.forEach(o => {
        orderMap[o.id] = o.order_uid;
      });

      // 5️⃣ Final clean response
      const cleanRooms = rooms.map(room => {
        let title = "Chat";

        if (room.contextType === "PRODUCT") {
          title = productMap[room.contextId] || "Product";
        }

        if (room.contextType === "ORDER") {
          title = orderMap[room.contextId] || "Order";
        }

        return {
          _id: room._id,
          contextType: room.contextType,
          contextId: room.contextId,
          title,
          lastMessage: room.lastMessage || "",
          lastMessageAt: room.lastMessageAt || null,
          participants: room.participants.map(p => ({
            userId: p.userId,
            roleId: p.roleId,
            name: userMap[p.userId] || "User"
          }))
        };
      });

      return res.status(200).json({ data: cleanRooms });

    } catch (error) {
      console.error("getUserRooms error:", error);
      return res.status(500).json({ message: "Failed to fetch rooms" });
    }
  }

  static async getMessages(req, res) {
    try {
      const { roomId, page = 1, limit = 20 } = req.query;

      if (!roomId) {
        return res.status(400).json({ message: "roomId is required" });
      }

      // 1️⃣ Fetch messages
      const messages = await Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      if (!messages.length) {
        return res.status(200).json({ data: [] });
      }

      // 2️⃣ Collect sender IDs
      const senderIds = [
        ...new Set(messages.map(msg => msg.senderId))
      ];

      // 3️⃣ Fetch senders from MySQL
      const users = await UserModel.getUsersByIds(senderIds);

      // 4️⃣ Create user map
      const userMap = {};
      users.forEach(u => {
        userMap[u.id] = `${u.first_name} ${u.last_name}`;
      });

      // 5️⃣ Decrypt + enrich messages
      const enrichedMessages = messages.map(msg => ({
        ...msg.toObject(),
        message: decryptText(msg.message),
        senderName: userMap[msg.senderId] || "User"
      }));

      return res.status(200).json({ data: enrichedMessages });

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
