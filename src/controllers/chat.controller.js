import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import { encryptText } from "../utils/encryption.js";
import { decryptText } from "../utils/encryption.js";
import { ROLES } from "../constants/roles.js";
import UserModel from "../models/mysql.model.js"; // MySQL
import { extractPureContextId } from "../utils/extractPureId.js";
import { uploadFileToS3 } from "../services/s3.service.js";

class ChatController {

  static async createRoom(req, res) {
    try {
      const { contextType, generalType, targetUserId } = req.body;
      let { contextId } = req.body;
      const authUser = req.user;

      /* =========================
        BASIC VALIDATION
      ========================= */
      if (!contextType) {
        return res.status(400).json({ message: "contextType is required" });
      }

      let participants = [];

      /* =========================
        GLOBAL RULE
        Buyer → Admin chat is NOT allowed
      ========================= */
      if (
        authUser.roleId === ROLES.BUYER &&
        (generalType === "ADMIN_SUPPORT" || generalType === "SELLER_ADMIN")
      ) {
        return res.status(403).json({
          message: "Buyers are not allowed to directly chat with admin"
        });
      }

      /* =========================
        GENERAL CHAT
      ========================= */
      if (contextType === "GENERAL") {

        /* ADMIN SUPPORT */
        if (generalType === "ADMIN_SUPPORT") {
          const admin = await UserModel.getDefaultAdmin();
          if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
          }

          participants = [
            { userId: admin.id, roleId: ROLES.ADMIN },
            { userId: authUser.userId, roleId: authUser.roleId }
          ];

          contextId = "ADMIN_SUPPORT";
        }

        /* BUYER ↔ SELLER */
        else if (generalType === "BUYER_SELLER") {
          if (authUser.roleId !== ROLES.BUYER) {
            return res.status(403).json({
              message: "Only buyers can start this chat"
            });
          }

          if (!targetUserId) {
            return res.status(400).json({
              message: "targetUserId required"
            });
          }

          const seller = await UserModel.getUserById(targetUserId);
          if (!seller || seller.roleId !== ROLES.SELLER) {
            return res.status(400).json({
              message: "Invalid seller"
            });
          }

          // Prevent duplicate rooms
          const sortedIds = [authUser.userId, seller.id].sort();
          contextId = `GENERAL_${sortedIds[0]}_${sortedIds[1]}`;

          participants = [
            { userId: authUser.userId, roleId: ROLES.BUYER },
            { userId: seller.id, roleId: ROLES.SELLER }
          ];
        }

        /* SELLER ↔ ADMIN */
        else if (generalType === "SELLER_ADMIN") {
          if (authUser.roleId !== ROLES.SELLER) {
            return res.status(403).json({
              message: "Only sellers can chat with admin"
            });
          }

          const admin = await UserModel.getDefaultAdmin();

          participants = [
            { userId: admin.id, roleId: ROLES.ADMIN },
            { userId: authUser.userId, roleId: ROLES.SELLER }
          ];

          contextId = `SELLER_ADMIN_${authUser.userId}`;
        }

        else {
          return res.status(400).json({ message: "Invalid generalType" });
        }
      }

      /* =========================
        PRODUCT CHAT
      ========================= */
      if (contextType === "PRODUCT") {
        const productId = extractPureContextId("PRODUCT", contextId);

        if (!productId) {
          return res.status(400).json({ message: "Invalid productId" });
        }

        const product = await UserModel.getSellerByContext("PRODUCT", productId);
        if (!product?.seller_id) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Buyer → Seller
        if (authUser.roleId === ROLES.BUYER) {
          if (product.seller_id === authUser.userId) {
            return res.status(400).json({
              message: "Cannot chat with yourself"
            });
          }

          participants = [
            { userId: product.seller_id, roleId: ROLES.SELLER },
            { userId: authUser.userId, roleId: ROLES.BUYER }
          ];
        }

        // Seller → Admin
        else if (authUser.roleId === ROLES.SELLER) {
          const admin = await UserModel.getDefaultAdmin();

          participants = [
            { userId: admin.id, roleId: ROLES.ADMIN },
            { userId: authUser.userId, roleId: ROLES.SELLER }
          ];

          contextId = `PRODUCT_ADMIN_${productId}_${authUser.userId}`;
        }
      }

      /* =========================
        ORDER CHAT
      ========================= */
      if (contextType === "ORDER") {
        const orderId = extractPureContextId("ORDER", contextId);

        if (!orderId) {
          return res.status(400).json({ message: "Invalid orderId" });
        }

        const order = await UserModel.getSellerByContext("ORDER", orderId);
        if (!order?.seller_id) {
          return res.status(404).json({ message: "Order not found" });
        }

        // Buyer → Seller
        if (authUser.roleId === ROLES.BUYER) {
          if (order.seller_id === authUser.userId) {
            return res.status(400).json({
              message: "Cannot chat with yourself"
            });
          }

          participants = [
            { userId: order.seller_id, roleId: ROLES.SELLER },
            { userId: authUser.userId, roleId: ROLES.BUYER }
          ];
        }

        // Seller → Admin
        else if (authUser.roleId === ROLES.SELLER) {
          const admin = await UserModel.getDefaultAdmin();

          participants = [
            { userId: admin.id, roleId: ROLES.ADMIN },
            { userId: authUser.userId, roleId: ROLES.SELLER }
          ];

          contextId = `ORDER_ADMIN_${orderId}_${authUser.userId}`;
        }
      }

      /* =========================
        FINAL VALIDATION
      ========================= */
      if (!participants.length) {
        return res.status(400).json({ message: "Invalid chat request" });
      }

      /* =========================
        FIND OR CREATE ROOM
      ========================= */
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

      return res.status(200).json({
        roomId: room._id,
        participants
      });

    } catch (error) {
      console.error("createRoom error:", error);
      return res.status(500).json({
        message: "Failed to create room"
      });
    }
  }

  static async getUserRooms(req, res) {
    try {
      // ✅ USER FROM JWT ONLY
      const authUserId = req.user.userId;

      // 1️⃣ Fetch rooms ONLY for authenticated user
      const rooms = await Room.find({
        "participants.userId": authUserId
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
          const productId = extractPureContextId("PRODUCT", room.contextId);
          if (productId) productIds.add(productId);
        }

        if (room.contextType === "ORDER") {
          const orderId = extractPureContextId("ORDER", room.contextId);
          if (orderId) orderIds.add(orderId);
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
          const productId = extractPureContextId("PRODUCT", room.contextId);
          title = productMap[productId] || "Product";
        }

        if (room.contextType === "ORDER") {
          const orderId = extractPureContextId("ORDER", room.contextId);
          title = orderMap[orderId] || "Order";
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

      // ✅ 1️⃣ Auth user from JWT
      const authUserId = req.user.userId;

      // ✅ 2️⃣ Check room existence
      const room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      // ✅ 3️⃣ Authorization check (CRITICAL)
      const isParticipant = room.participants.some(
        p => String(p.userId) === String(authUserId)
      );

      if (!isParticipant) {
        return res.status(403).json({
          message: "You are not part of this room"
        });
      }

      // ✅ 4️⃣ Fetch messages (authorized)
      const messages = await Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      if (!messages.length) {
        return res.status(200).json({ data: [] });
      }

      // 5️⃣ Collect sender IDs
      const senderIds = [...new Set(messages.map(m => m.senderId))];

      // 6️⃣ Fetch users from MySQL
      const users = await UserModel.getUsersByIds(senderIds);

      // 7️⃣ Map users
      const userMap = {};
      users.forEach(u => {
        userMap[u.id] = `${u.first_name} ${u.last_name}`;
      });

      // 8️⃣ Decrypt + enrich
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
      const { roomId } = req.body;
      let { message, messageType = "TEXT" } = req.body;
      const { userId, roleId } = req.user;

      if (!roomId) {
        return res.status(400).json({ message: "roomId is required" });
      }

      // If a file was uploaded, upload it to S3 and use the URL as the message
      const file = req.files && req.files.length > 0 ? req.files[0] : req.file;
      
      if (file) {
        const fileUrl = await uploadFileToS3(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        message = fileUrl;
        
        // Auto-detect type if not given
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
        message: encryptedMessage,
        messageType
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

  static async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
      
      const fileUrl = await uploadFileToS3(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      
      return res.status(200).json({
        success: true,
        message: "File uploaded successfully",
        data: {
          url: fileUrl,
          mimetype: req.file.mimetype,
          name: req.file.originalname
        }
      });
    } catch (error) {
      console.error("uploadFile error:", error);
      return res.status(500).json({ message: "Failed to upload file" });
    }
  }

}

export default ChatController;
