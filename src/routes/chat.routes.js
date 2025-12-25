import express from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import ChatController from "../controllers/chat.controller.js";

const router = express.Router();
router.post("/createroom", authMiddleware, ChatController.createRoom);
router.get("/rooms", authMiddleware, ChatController.getUserRooms);
router.get("/messages", authMiddleware, ChatController.getMessages);
router.post("/message", authMiddleware, ChatController.sendMessage);

export default router;
