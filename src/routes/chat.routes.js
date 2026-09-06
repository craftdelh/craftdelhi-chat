import express from "express";
import multer from "multer";
import { authMiddleware, internalServiceMiddleware } from "../middlewares/auth.middleware.js";
import ChatController from "../controllers/chat.controller.js";
import QuotationController from "../controllers/quotation.controller.js";
import OrderController from "../controllers/order.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});
const router = express.Router();

/* ==========================================================================
   NORMAL CHAT ROUTES
   ========================================================================== */
router.post("/createroom", authMiddleware, ChatController.createRoom);
router.get("/rooms", authMiddleware, ChatController.getUserRooms);
router.get("/messages", authMiddleware, ChatController.getMessages);
router.post("/message", authMiddleware, upload.any(), ChatController.sendMessage);
router.post("/messages/read", authMiddleware, ChatController.markMessagesRead);

/* ==========================================================================
   QUOTATION ROUTES
   ========================================================================== */
router.post("/quotations", authMiddleware, QuotationController.createQuotation);
router.get("/quotations/room/:roomId", authMiddleware, QuotationController.getQuotationsByRoom);
router.get("/quotations/:id", authMiddleware, QuotationController.getQuotationById);
router.put("/quotations/:id", authMiddleware, QuotationController.updateQuotation);
router.post("/quotations/:id/accept", authMiddleware, QuotationController.acceptQuotation);
router.post("/quotations/:id/reject", authMiddleware, QuotationController.rejectQuotation);
router.post("/quotations/:id/mark-paid", internalServiceMiddleware, QuotationController.markPaidAndCreateOrderChat);

/* ==========================================================================
   ORDER & ORDER CHAT ROUTES
   ========================================================================== */
router.get("/orders", authMiddleware, OrderController.getOrders);
router.get("/orders/:id", authMiddleware, OrderController.getOrderDetails);
router.get("/orders/:id/chat", authMiddleware, OrderController.getOrderChat);
router.get("/orders/:id/messages", authMiddleware, OrderController.getOrderMessages);
router.post("/orders/:id/messages", authMiddleware, upload.any(), OrderController.sendOrderMessage);
router.post("/orders/:id/read", authMiddleware, OrderController.markOrderMessagesRead);

export default router;
