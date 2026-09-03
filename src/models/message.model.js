import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },
  senderId: { type: String, required: true },
  senderRoleId: { type: Number, required: true },

  message: { type: String, required: true },
  messageType: {
    type: String,
    enum: ["TEXT", "IMAGE", "VIDEO", "PDF", "FILE", "QUOTATION", "SYSTEM"],
    default: "TEXT"
  },
  quotationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quotation",
    default: null
  },

  readBy: { type: [String], default: [] }
}, { timestamps: true });

export default mongoose.model("Message", messageSchema);
