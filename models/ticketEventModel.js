const db = require('../config/database');

// Append-only log behind Ticket Statistics in the admin panel (table created by
// gamingAdminNode/migrations/20261114-ticket-events.sql). The admin API logs admin replies, this logs new tickets and the
// user's later messages. Writing to it must never break creating or answering a ticket: any failure (for example the table
// not created yet) is only logged, and not on every call.
let lastErrorLoggedAt = 0;

class TicketEventModel {
    // eventType: 'created' | 'user_reply'. eventAt: IST "YYYY-MM-DD HH:mm:ss".
    static async record({ messageId, tokenNo, eventType, userId, eventAt }) {
        try {
            await db.promise().query(
                `INSERT IGNORE INTO tbl_ticket_event (message_id, token_no, event_type, user_id, admin_id, event_at)
                 VALUES (?, ?, ?, ?, NULL, ?)`,
                [messageId || null, tokenNo, eventType, userId || null, eventAt]
            );
        } catch (error) {
            if (Date.now() - lastErrorLoggedAt > 5 * 60 * 1000) {
                lastErrorLoggedAt = Date.now();
                console.error('TicketEvent record failed (ticket statistics miss this event):', error.message);
            }
        }
    }
}

module.exports = TicketEventModel;
