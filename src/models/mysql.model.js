import mysqlPool from "../config/mysql.js";

class UserModel {

  static async getSellerByContext(contextType, contextId) {

    let query = "";
    let params = [contextId];

    if (contextType === "PRODUCT") {
      query = `
        SELECT 
          u.id AS seller_id,
          u.first_name,
          u.last_name,
          u.email
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.id = ?
        LIMIT 1
      `;
    }

    if (contextType === "ORDER") {
      query = `
        SELECT 
          u.id AS seller_id,
          u.first_name,
          u.last_name,
          u.email
        FROM order_details od
        JOIN users u ON od.seller_id = u.id
        WHERE od.id = ?
        LIMIT 1
      `;
    }

    if (!query) return null;

    const [rows] = await mysqlPool.query(query, params);
    return rows[0] || null;
  }

  static async getDefaultAdmin() {
    const [rows] = await mysqlPool.query(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE role = 1
       ORDER BY id ASC
       LIMIT 1`
    );

    return rows[0] || null;
  }

  static async getProductsByIds(productIds = []) {
    if (!productIds.length) return [];

    const [rows] = await mysqlPool.query(
      `SELECT id, name 
      FROM products 
      WHERE id IN (?)`,
      [productIds]
    );

    return rows;
  }
  
  static async getOrdersByIds(orderIds = []) {
    if (!orderIds.length) return [];

    const [rows] = await mysqlPool.query(
      `SELECT id, order_uid 
      FROM order_details 
      WHERE id IN (?)`,
      [orderIds]
    );

    return rows;
  }

  static async getUsersByIds(userIds = []) {
    if (!userIds.length) return [];

    const [rows] = await mysqlPool.query(
      `SELECT id, first_name, last_name 
      FROM users 
      WHERE id IN (?)`,
      [userIds]
    );

    return rows;
  }
    static async getUserById(userId) {
      const [rows] = await mysqlPool.query(
        `SELECT id, first_name, last_name, role AS roleId
        FROM users
        WHERE id = ?
        LIMIT 1`,
        [userId]
      );

      return rows[0] || null;
    }
}

export default UserModel;
