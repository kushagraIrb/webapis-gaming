const db = require('../config/database');

class ToastEventModel {
    static async insert(user_id, type, payload) {
        const [result] = await db.promise().query(
            `INSERT INTO tbl_toast_event (user_id, type, payload, is_delivered) VALUES (?, ?, ?, 0)`,
            [user_id, type, payload ? JSON.stringify(payload) : null]
        );
        return result.insertId;
    }

    static async getById(id) {
        const [rows] = await db.promise().query(
            `SELECT id, user_id, type, payload, is_delivered, created FROM tbl_toast_event WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    // Returns undelivered rows for user within the last withinHours; older undelivered
    // rows are silently marked delivered so an offline-for-days user isn't spammed.
    static async listPending(user_id, withinHours = 24) {
        const hours = Math.max(1, Math.min(720, Math.floor(withinHours)));
        const [rows] = await db.promise().query(
            `SELECT id, user_id, type, payload, created
               FROM tbl_toast_event
              WHERE user_id = ?
                AND is_delivered = 0
                AND created >= (NOW() - INTERVAL ${hours} HOUR)
              ORDER BY id ASC`,
            [user_id]
        );
        await db.promise().query(
            `UPDATE tbl_toast_event
                SET is_delivered = 1, delivered_at = NOW()
              WHERE user_id = ?
                AND is_delivered = 0
                AND created < (NOW() - INTERVAL ${hours} HOUR)`,
            [user_id]
        );
        return rows;
    }

    static async markDelivered(id, user_id) {
        await db.promise().query(
            `UPDATE tbl_toast_event
                SET is_delivered = 1, delivered_at = NOW()
              WHERE id = ? AND user_id = ? AND is_delivered = 0`,
            [id, user_id]
        );
    }
}

module.exports = ToastEventModel;
