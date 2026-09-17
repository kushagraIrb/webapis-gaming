const db = require('../config/database');
const moment = require('moment-timezone');

// All wall-clock values stored in tbl_toast_event are IST-formatted strings
// so they line up with the rest of this backend's convention (istTime used
// across models). Comparisons against server NOW() would otherwise be off
// by whatever offset the DB session runs at.
const istNow = () => moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
const istSubtract = (amount, unit) =>
    moment().tz('Asia/Kolkata').subtract(amount, unit).format('YYYY-MM-DD HH:mm:ss');

class ToastEventModel {
    static async insert(user_id, type, payload) {
        const istTime = istNow();
        const [result] = await db.promise().query(
            `INSERT INTO tbl_toast_event (user_id, type, payload, is_delivered, created) VALUES (?, ?, ?, 0, ?)`,
            [user_id, type, payload ? JSON.stringify(payload) : null, istTime]
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
        const cutoff = istSubtract(hours, 'hours');
        const istTime = istNow();
        const [rows] = await db.promise().query(
            `SELECT id, user_id, type, payload, created
               FROM tbl_toast_event
              WHERE user_id = ?
                AND is_delivered = 0
                AND created >= ?
              ORDER BY id ASC`,
            [user_id, cutoff]
        );
        await db.promise().query(
            `UPDATE tbl_toast_event
                SET is_delivered = 1, delivered_at = ?
              WHERE user_id = ?
                AND is_delivered = 0
                AND created < ?`,
            [istTime, user_id, cutoff]
        );
        return rows;
    }

    static async markDelivered(id, user_id) {
        const istTime = istNow();
        await db.promise().query(
            `UPDATE tbl_toast_event
                SET is_delivered = 1, delivered_at = ?
              WHERE id = ? AND user_id = ? AND is_delivered = 0`,
            [istTime, id, user_id]
        );
    }
}

module.exports = ToastEventModel;
