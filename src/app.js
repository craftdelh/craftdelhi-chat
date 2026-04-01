import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat.routes.js";
import { socketConfig } from "./config/socket.js";

const app = express();

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    // Check against allowed origins in env
    const allowed = process.env.ALLOWED_ORIGINS?.split(",").map(o => o.trim()) || [];
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    
    // Fallback: allow dynamically for dev, or block for strict prod
    return callback(null, true);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/", chatRoutes);

export default app;
