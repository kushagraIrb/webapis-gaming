const db = require('../config/database');

class CoinflipLogger {
  static async log({ query, execution_time, type, table_name, result }) {
    try {
      const sql = `
        INSERT INTO tbl_coinflip_logs
        (query, execution_time, type, table_name, result)
        VALUES (?, ?, ?, ?, ?)
      `;

      await db.promise().query(sql, [
        query,
        execution_time,
        type,
        table_name,
        typeof result === 'string' ? result : JSON.stringify(result)
      ]);
    } catch (err) {
      // ❗ never throw from logger (avoid breaking main flow)
      console.error('Coinflip log error:', err.message);
    }
  }
}

module.exports = CoinflipLogger;