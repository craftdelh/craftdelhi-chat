import mongoose from "mongoose";
import Quotation from "../models/quotation.model.js";
import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import { encryptText } from "../utils/encryption.js";
import { ROLES } from "../constants/roles.js";
import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import { getIO } from "../sockets/chat.socket.js";

const cleanSummaryValue = (value, fallback = "Not provided") => {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
};

const buildOrderDetailsMessage = (quotation, orderId, orderUid, summary = {}) => {
  const items = Array.isArray(summary.items)
    ? summary.items.slice(0, 20).map((item) => {
        const name = cleanSummaryValue(item?.name, "Custom item");
        const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
        return `${name} (x${quantity})`;
      })
    : [];

  const fallbackItem = cleanSummaryValue(
    summary.buyerNote || quotation.description,
    "Custom order"
  );
  const amount = Number(summary.amount ?? quotation.amount);

  return [
    "📦 *Order Details Received*",
    `📦 *Order ID:* #${cleanSummaryValue(summary.orderUid || orderUid || orderId)}`,
    `👤 *Buyer:* ${cleanSummaryValue(summary.buyer, "Customer")}`,
    `💰 *Amount:* ₹${Number.isFinite(amount) ? amount : Number(quotation.amount || 0)}`,
    `📍 *Address:* ${cleanSummaryValue(summary.address)}`,
    `🛍️ *Items:* ${items.length ? items.join(", ") : `${fallbackItem} (x1)`}`,
    "",
    "✍️ Please send your personalisation instructions, wording, colours, reference images, and any changes you require in this chat."
  ].join("\n");
};

class QuotationController {

  static async createQuotation(req, res) {
    try {
      const { roomId, amount, description } = req.body;
      const { userId, roleId } = req.user;

      if (!roomId || amount === undefined || !String(description || "").trim()) {
        return res.status(400).json({ message: "roomId, amount, and description are required" });
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }

      // Only Provider (Seller or Admin) can create quotation
      if (Number(roleId) !== ROLES.SELLER && Number(roleId) !== ROLES.ADMIN) {
        return res.status(403).json({ message: "Only sellers or admins can create quotations" });
      }

      const room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      const isParticipant = room.participants.some(p => String(p.userId) === String(userId));
      if (!isParticipant) {
        return res.status(403).json({ message: "You are not a participant of this chat room" });
      }

      // Identify Customer & Provider
      const provider = { userId: String(userId), roleId: Number(roleId) };
      const customerParticipant = room.participants.find(
        p => String(p.userId) !== String(userId) && Number(p.roleId) === ROLES.BUYER
      );

      if (!customerParticipant) {
        return res.status(400).json({ message: "No customer participant found in this room" });
      }

      const customer = {
        userId: String(customerParticipant.userId),
        roleId: Number(customerParticipant.roleId)
      };

      const quotation = await Quotation.create({
        roomId,
        customer,
        provider,
        amount: parsedAmount,
        description: String(description).trim(),
        status: "PENDING"
      });

      // Post chat message in normal chat
      const rawMsg = `Quotation created: ₹${amount} - ${description}`;
      const encryptedMsg = encryptText(rawMsg);

      const msg = await Message.create({
        roomId,
        senderId: String(userId),
        senderRoleId: Number(roleId),
        message: encryptedMsg,
        messageType: "QUOTATION",
        quotationId: quotation._id
      });

      room.lastMessage = `[Quotation] ₹${amount} - ${description}`;
      room.lastMessageAt = new Date();
      await room.save();

      // Emit Socket event if IO initialized
      const io = getIO();
      if (io) {
        const socketMessage = {
          _id: msg._id,
          roomId: String(roomId),
          message: rawMsg,
          messageType: "QUOTATION",
          quotationId: quotation._id,
          quotation: quotation,
          senderId: String(userId),
          senderRoleId: Number(roleId),
          createdAt: msg.createdAt
        };
        io.to(String(roomId)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, socketMessage);
        io.to(String(roomId)).emit(SOCKET_EVENTS.QUOTATION_CREATED, {
          quotation
        });
      }

      return res.status(201).json({
        success: true,
        message: "Quotation created successfully",
        data: quotation
      });

    } catch (error) {
      console.error("createQuotation error:", error);
      return res.status(500).json({ message: "Failed to create quotation", error: error.message });
    }
  }

  static async getQuotationsByRoom(req, res) {
    try {
      const { roomId } = req.params;
      const { userId } = req.user;

      const room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      const isParticipant = room.participants.some(p => String(p.userId) === String(userId));
      if (!isParticipant) {
        return res.status(403).json({ message: "You are not part of this chat room" });
      }

      const quotations = await Quotation.find({ roomId }).sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: quotations
      });
    } catch (error) {
      console.error("getQuotationsByRoom error:", error);
      return res.status(500).json({ message: "Failed to fetch quotations" });
    }
  }

  static async getQuotationById(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const quotation = await Quotation.findById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      const isCustomer = String(quotation.customer.userId) === String(userId);
      const isProvider = String(quotation.provider.userId) === String(userId);

      if (!isCustomer && !isProvider) {
        return res.status(403).json({ message: "Not authorized to access this quotation" });
      }

      return res.status(200).json({
        success: true,
        data: quotation
      });
    } catch (error) {
      console.error("getQuotationById error:", error);
      return res.status(500).json({ message: "Failed to fetch quotation" });
    }
  }

  static async updateQuotation(req, res) {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;
      const { userId } = req.user;

      const quotation = await Quotation.findById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      if (String(quotation.provider.userId) !== String(userId)) {
        return res.status(403).json({ message: "Only the quotation creator can update it" });
      }

      if (quotation.status !== "PENDING") {
        return res.status(400).json({ message: `Cannot update quotation with status ${quotation.status}` });
      }

      if (amount !== undefined) {
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          return res.status(400).json({ message: "Amount must be greater than 0" });
        }
        quotation.amount = parsedAmount;
      }
      if (description !== undefined) {
        if (!String(description).trim()) {
          return res.status(400).json({ message: "Description cannot be empty" });
        }
        quotation.description = String(description).trim();
      }

      await quotation.save();

      const io = getIO();
      if (io) {
        io.to(String(quotation.roomId)).emit(SOCKET_EVENTS.QUOTATION_UPDATED, {
          quotation
        });
      }

      return res.status(200).json({
        success: true,
        message: "Quotation updated successfully",
        data: quotation
      });
    } catch (error) {
      console.error("updateQuotation error:", error);
      return res.status(500).json({ message: "Failed to update quotation" });
    }
  }

  static async acceptQuotation(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid quotation ID format" });
      }

      const quotation = await Quotation.findById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      if (String(quotation.customer.userId) !== String(userId)) {
        return res.status(403).json({ message: "Only the customer can accept the quotation" });
      }

      if (quotation.status !== "PENDING") {
        return res.status(400).json({ message: `Cannot accept quotation in state '${quotation.status}'` });
      }

      quotation.status = "ACCEPTED";
      await quotation.save();

      // Post system message to chat room
      const rawMsg = `Quotation of ₹${quotation.amount} accepted by customer. Ready for payment.`;
      await Message.create({
        roomId: quotation.roomId,
        senderId: String(userId),
        senderRoleId: req.user.roleId,
        message: encryptText(rawMsg),
        messageType: "SYSTEM",
        quotationId: quotation._id
      });

      const io = getIO();
      if (io) {
        io.to(String(quotation.roomId)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
          roomId: String(quotation.roomId),
          message: rawMsg,
          messageType: "SYSTEM",
          quotationId: quotation._id,
          quotation: quotation,
          createdAt: new Date()
        });
        io.to(String(quotation.roomId)).emit(SOCKET_EVENTS.QUOTATION_UPDATED, {
          quotation: quotation
        });
      }

      return res.status(200).json({
        success: true,
        message: "Quotation accepted successfully",
        data: quotation
      });
    } catch (error) {
      console.error("acceptQuotation error:", error);
      return res.status(500).json({ message: "Failed to accept quotation" });
    }
  }

  static async rejectQuotation(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const quotation = await Quotation.findById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      if (String(quotation.customer.userId) !== String(userId)) {
        return res.status(403).json({ message: "Only the customer can reject the quotation" });
      }

      if (quotation.status !== "PENDING") {
        return res.status(400).json({ message: `Cannot reject quotation in state '${quotation.status}'` });
      }

      quotation.status = "REJECTED";
      await quotation.save();

      const rawMsg = `Quotation of ₹${quotation.amount} was rejected by customer.`;
      await Message.create({
        roomId: quotation.roomId,
        senderId: String(userId),
        senderRoleId: req.user.roleId,
        message: encryptText(rawMsg),
        messageType: "SYSTEM",
        quotationId: quotation._id
      });

      const io = getIO();
      if (io) {
        io.to(String(quotation.roomId)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
          roomId: String(quotation.roomId),
          message: rawMsg,
          messageType: "SYSTEM",
          quotationId: quotation._id,
          createdAt: new Date()
        });
        io.to(String(quotation.roomId)).emit(SOCKET_EVENTS.QUOTATION_UPDATED, {
          quotation
        });
      }

      return res.status(200).json({
        success: true,
        message: "Quotation rejected successfully",
        data: quotation
      });
    } catch (error) {
      console.error("rejectQuotation error:", error);
      return res.status(500).json({ message: "Failed to reject quotation" });
    }
  }

  static async markPaidAndCreateOrderChat(req, res) {
    try {
      const { id } = req.params;
      const {
        orderId,
        orderUid,
        razorpay_order_id,
        razorpay_payment_id,
        orderSummary
      } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid quotation ID format" });
      }

      if (!orderId || !orderUid) {
        return res.status(400).json({ message: "orderId and orderUid are required" });
      }

      const quotation = await Quotation.findById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      // Idempotency check: if already PAID, return existing order room
      if (quotation.status === "PAID" && quotation.orderId && quotation.orderRoomId) {
        return res.status(200).json({
          success: true,
          message: "Quotation already marked as paid",
          data: {
            orderId: quotation.orderId,
            orderUid: quotation.orderUid,
            orderRoomId: quotation.orderRoomId,
            quotation
          }
        });
      }

      let targetQuotation;
      if (quotation.status === "PAID" && quotation.orderId) {
        if (String(quotation.orderId) !== String(orderId)) {
          return res.status(409).json({ message: "Quotation is already linked to another order" });
        }
        targetQuotation = quotation;
      } else {
        // Atomic status transition prevents two different orders from claiming one quotation.
        targetQuotation = await Quotation.findOneAndUpdate(
          { _id: id, status: "ACCEPTED" },
          {
            $set: {
              status: "PAID",
              orderId: String(orderId),
              orderUid: String(orderUid),
              razorpayOrderId: razorpay_order_id || null,
              razorpayPaymentId: razorpay_payment_id || null
            }
          },
          { returnDocument: "after" }
        );

        if (!targetQuotation) {
          return res.status(409).json({
            message: `Quotation cannot be marked paid from state '${quotation.status}'`
          });
        }
      }

      // Automatically create separate order-chat room
      const orderContextId = `ORDER_${orderId}`;
      const orderParticipants = [
        targetQuotation.customer,
        targetQuotation.provider
      ];

      let orderRoom = await Room.findOne({
        contextType: "ORDER",
        contextId: { $in: [orderContextId, String(orderId)] }
      });

      if (!orderRoom) {
        orderRoom = await Room.create({
          contextType: "ORDER",
          contextId: orderContextId,
          participants: orderParticipants,
          lastMessage: `Order #${orderUid} created`,
          lastMessageAt: new Date()
        });
      }

      // Post system message in order chat
      const sysMsgText = buildOrderDetailsMessage(
        targetQuotation,
        orderId,
        orderUid,
        orderSummary
      );
      await Message.create({
        roomId: orderRoom._id,
        senderId: String(targetQuotation.customer.userId),
        senderRoleId: targetQuotation.customer.roleId,
        message: encryptText(sysMsgText),
        messageType: "SYSTEM",
        quotationId: targetQuotation._id
      });

      // Update quotation with orderRoomId
      targetQuotation.orderRoomId = orderRoom._id;
      targetQuotation.orderId = String(orderId);
      targetQuotation.orderUid = String(orderUid);
      await targetQuotation.save();

      // Post notification in original normal chat
      const origRoomMsgText = `Payment confirmed! Order #${orderUid} created. Dedicated order chat ready.`;
      await Message.create({
        roomId: targetQuotation.roomId,
        senderId: String(targetQuotation.customer.userId),
        senderRoleId: targetQuotation.customer.roleId,
        message: encryptText(origRoomMsgText),
        messageType: "SYSTEM",
        quotationId: targetQuotation._id
      });

      // Notify via Socket.IO
      const io = getIO();
      if (io) {
        io.to(String(targetQuotation.roomId)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
          roomId: String(targetQuotation.roomId),
          message: origRoomMsgText,
          messageType: "SYSTEM",
          createdAt: new Date()
        });

        io.to(String(orderRoom._id)).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, {
          roomId: String(orderRoom._id),
          message: sysMsgText,
          messageType: "SYSTEM",
          createdAt: new Date()
        });
        io.to(String(targetQuotation.roomId)).emit(SOCKET_EVENTS.QUOTATION_UPDATED, {
          quotation: targetQuotation
        });
        io.to(String(targetQuotation.roomId)).emit(SOCKET_EVENTS.ORDER_CREATED, {
          quotationId: targetQuotation._id,
          orderId: String(orderId),
          orderUid: String(orderUid),
          orderRoomId: orderRoom._id
        });
      }

      return res.status(200).json({
        success: true,
        message: "Quotation marked as paid and order chat created successfully",
        data: {
          orderId: String(orderId),
          orderUid: String(orderUid),
          orderRoomId: orderRoom._id,
          quotation: targetQuotation
        }
      });
    } catch (error) {
      console.error("markPaidAndCreateOrderChat error:", error);
      return res.status(500).json({ message: "Failed to mark quotation paid and create order chat", error: error.message });
    }
  }

}

export default QuotationController;
