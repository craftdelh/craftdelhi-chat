import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: String(decoded.id),
      roleId: decoded.role
    };

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const internalServiceMiddleware = (req, res, next) => {
  try {
    const token = req.headers["x-service-token"];
    if (!token || typeof token !== "string") {
      return res.status(401).json({ message: "Internal service authentication is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.service !== "craftdelhi-main-backend") {
      return res.status(403).json({ message: "Invalid internal service identity" });
    }

    req.service = decoded.service;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired internal service token" });
  }
};
