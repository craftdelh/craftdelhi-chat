import express from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import ChatController from "../controllers/chat.controller.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.post("/createroom", authMiddleware, ChatController.createRoom);
router.get("/rooms", authMiddleware, ChatController.getUserRooms);
router.get("/messages", authMiddleware, ChatController.getMessages);
router.post("/message", authMiddleware, upload.any(), ChatController.sendMessage);

export default router;
