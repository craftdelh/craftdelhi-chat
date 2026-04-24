import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat.routes.js";
import { socketConfig } from "./config/socket.js";
const webhookHandler = require('./utils/webhook.js');

const app = express();

// 🚀 BULLETPROOF CORS OVERRIDE (Forces headers on EVERY response)
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/", chatRoutes);
app.use("/webhook", webhookHandler);
export default app;
