import mysql from 'mysql2/promise';
import 'dotenv/config';

// إنشاء Pool للاتصالات - أكثر أماناً وكفاءة
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'world_of_farmcraft',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000
});

/**
 * تنفيذ استعلام مع محدودات آمنة
 * @param {string} sql - الاستعلام مع علامات الاستفهام
 * @param {Array} params - المدخلات
 */
async function query(sql, params = []) {
  const [results] = await pool.execute(sql, params);
  return results;
}

/**
 * الحصول على اتصال من Pool
 */
async function getConnection() {
  return await pool.getConnection();
}

/**
 * تنفيذ استعلام في معاملة (transaction)
 */
async function transaction(callback) {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export { pool, query, getConnection, transaction };
