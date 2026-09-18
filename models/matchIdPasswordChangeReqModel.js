// User backend model for tbl_match_id_password_change_req.
//
// Only the user-side write path lives here (create + duplicate check +
// ownership check). Admin-side list/approve queries live on gamingAdminNode
// under models/matchIdPasswordChangeReqModel.js — they share the DB but
// keep their own model files to match the codebase pattern.

const db = require('../config/database');
const moment = require('moment-timezone');

class MatchIdPasswordChangeReqModel {
    // Ownership guard — a user should only be able to open a request for a
    // Match ID they actually own. Backend enforcement (spec § 1).
    static async userOwnsMatchIdForSite(userId, siteId) {
        const [rows] = await db.promise().query(
            `SELECT id FROM tbl_user_match_ids
              WHERE user_id = ? AND site_id = ?
              LIMIT 1`,
            [Number(userId), Number(siteId)]
        );
        return rows.length > 0;
    }

    // Duplicate check — only one PENDING request per (user, site) at a time.
    static async hasPendingRequest(userId, siteId) {
        const [rows] = await db.promise().query(
            `SELECT id FROM tbl_match_id_password_change_req
              WHERE user_id = ? AND site_id = ? AND status = 'pending'
              LIMIT 1`,
            [Number(userId), Number(siteId)]
        );
        return rows.length > 0;
    }

    static async insert(userId, siteId) {
        const istTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
        const [result] = await db.promise().query(
            `INSERT INTO tbl_match_id_password_change_req
                (user_id, site_id, status, requested_at)
             VALUES (?, ?, 'pending', ?)`,
            [Number(userId), Number(siteId), istTime]
        );
        return { id: result.insertId, requested_at: istTime };
    }

    // Idempotent — flip password_seen_at only if the row belongs to this
    // user (never touches another user's row) and only if it has a
    // meaningful updated_at (nothing to acknowledge otherwise).
    static async markPasswordSeen(userId, siteId) {
        const istTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
        const [result] = await db.promise().query(
            `UPDATE tbl_user_match_ids
                SET password_seen_at = ?
              WHERE user_id = ? AND site_id = ?
                AND password_updated_at IS NOT NULL
                AND (password_seen_at IS NULL OR password_seen_at < password_updated_at)`,
            [istTime, Number(userId), Number(siteId)]
        );
        return result.affectedRows > 0;
    }
}

module.exports = MatchIdPasswordChangeReqModel;
