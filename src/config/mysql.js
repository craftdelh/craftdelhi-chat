import mysql from "mysql2/promise";
import { ENV } from "./env.js";

const mysqlPool = mysql.createPool({
  host: ENV.MYSQL_HOST,
  user: ENV.MYSQL_USER,
  password: ENV.MYSQL_PASSWORD,
  database: ENV.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10
});

// 🔍 Test MySQL connection
(async () => {
  try {
    const connection = await mysqlPool.getConnection();
    console.log("✅ MySQL connected successfully");
    connection.release();
  } catch (error) {
    console.warn("⚠️ MySQL connection warning:", error.message);
  }
})();

export default mysqlPool;
