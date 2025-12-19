import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  roleId: { type: Number, required: true } // 1,2,3
}, { _id: false });

const roomSchema = new mongoose.Schema({
  contextType: {
    type: String,
    enum: ["PRODUCT", "ORDER", "GENERAL"],
    required: true
  },
  contextId: {
    type: String,
    default: null
  },
  participants: {
    type: [participantSchema],
    required: true
  },
  lastMessage: String,
  lastMessageAt: Date
}, { timestamps: true });

export default mongoose.model("Room", roomSchema);
