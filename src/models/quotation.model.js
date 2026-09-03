import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  roleId: { type: Number, required: true }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },
  customer: {
    type: participantSchema,
    required: true
  },
  provider: {
    type: participantSchema,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["PENDING", "ACCEPTED", "REJECTED", "PAID", "CANCELLED"],
    default: "PENDING"
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  orderId: {
    type: String,
    default: null
  },
  orderUid: {
    type: String,
    default: null
  },
  orderRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    default: null
  }
}, { timestamps: true });

export default mongoose.model("Quotation", quotationSchema);
