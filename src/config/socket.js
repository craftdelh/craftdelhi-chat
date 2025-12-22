const allowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(",")
  .map(o => o.trim());

export const socketConfig = {
  cors: {
    origin: (origin, callback) => {
      // allow server-to-server or Postman (no origin)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
};
