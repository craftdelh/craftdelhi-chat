const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(o => o.trim());

export const socketConfig = {
  cors: {
    origin: (origin, callback) => {
      // allow server-to-server, mobile apps or Postman (no origin)
      if (!origin) return callback(null, true);

      // allow any localhost / 127.0.0.1 origins for local testing
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true); // Dev fallback
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
};
