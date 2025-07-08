const db = require('../config/database');
const moment = require('moment-timezone');

class TicketModel {
    // Delete Ticket
    static async getTicketById(ticketId) {
        const query = `SELECT * FROM tbl_support_ticket WHERE id = ? LIMIT 1`;

        try {
            const [rows] = await db.promise().query(query, [ticketId]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching ticket by ID:', error.message);
            throw error;
        }
    }

    static async closeTicketsByTokenNos(tokenNos) {
        if (!tokenNos.length) return 0;

        const placeholders = tokenNos.map(() => '?').join(', ');
        const query = `UPDATE tbl_support_ticket SET status = 'Close' WHERE token_no IN (${placeholders})`;

        try {
            const [result] = await db.promise().query(query, tokenNos);
            return result.affectedRows;
        } catch (error) {
            console.error('Error closing old tickets:', error.message);
            throw error;
        }
    }

    // Delete all 'Close' status tickets for a given user
    static async deleteClosedTicketsByUser(userId) {
        const query = `DELETE FROM tbl_support_ticket WHERE userBy = ? AND status = 'Close'`;
        try {
            const [result] = await db.promise().query(query, [userId]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error deleting closed tickets:', error.message);
            throw error;
        }
    }

    // Fetch ticket types
    static async getTicketTypes() {
        try {
            const query = `SELECT tid, reason FROM tbl_support_reason WHERE status = 1 ORDER BY tid ASC`;
            const [rows] = await db.promise().query(query);
            return rows;
        } catch (error) {
            console.error('Error fetching ticket reasons:', error.message);
            throw new Error('Failed to fetch ticket reasons');
        }
    }
  
    // Insert ticket data
    static async insertTicket(ticketData) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `INSERT INTO tbl_support_ticket (issues, remarks, attachment, status, userBy, modified, read_msg, read_by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [
            ticketData.issues,
            ticketData.remarks,
            ticketData.attachment,
            ticketData.status,
            ticketData.userBy,
            istTime,
            ticketData.read_msg,
            ticketData.read_by_user,
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error inserting ticket:', error.message);
            throw error;
        }
    }

    // Update ticket with token number
    static async updateTicketWithToken(ticketId, tokenNo) {
        const query = `UPDATE tbl_support_ticket SET token_no = ? WHERE id = ?`;
        try {
            const [result] = await db.promise().query(query, [tokenNo, ticketId]);
            return result;
        } catch (error) {
            console.error('Error updating ticket token:', error.message);
            throw error;
        }
    }

    // Fetch ticket history for a user
    static async getTicketHistory(userId, start, perPage) {
        let query = `
            SELECT 
                r.reason, 
                t.id, 
                t.token_no, 
                t.issues, 
                t.remarks, 
                t.attachment, 
                t.status, 
                t.modified
            FROM tbl_support_ticket t
            LEFT JOIN tbl_support_reason r ON r.tid = t.issues
            WHERE t.id IN (
                SELECT MAX(id) 
                FROM tbl_support_ticket 
                WHERE userBy = ? 
                GROUP BY token_no
            )
            ORDER BY t.id DESC
        `;

        // Add pagination if required
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, start, perPage]);
            return rows;
        }

        // Fetch all data if no pagination
        const [rows] = await db.promise().query(query, [userId]);
        return rows;
    }

    static async insertTicketReply(ticketData) {
        const indiaTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
        
        const query = `INSERT INTO tbl_support_ticket (token_no, issues, remarks, attachment, status, userBy, modified, updated_at, read_msg, read_by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [
            ticketData.token_no,
            ticketData.issues,
            ticketData.remarks,
            ticketData.attachment,
            ticketData.status,
            ticketData.userBy,
            indiaTime,
            indiaTime,
            ticketData.read_msg,
            ticketData.read_by_user
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error inserting ticket reply:', error.message);
            throw error;
        }
    }

    static async fetchHistoryDataByTicketID(token_no, user_id) {
        const query = `
            SELECT 
                i.reason, s.token_no, s.id, s.read_msg, s.attachment, 
                s.remarks, s.status, s.modified, s.userBy, s.admin_id, 
                r.first_name, r.last_name
            FROM tbl_support_ticket s
            LEFT JOIN tbl_support_reason i ON i.tid = s.issues
            LEFT JOIN tbl_registration r ON r.id = s.userBy
            WHERE s.token_no = ? AND s.userBy = ?
            ORDER BY s.id ASC
        `;

        try {
            const [result] = await db.promise().query(query, [token_no, user_id]);
            return result;
        } catch (error) {
            console.error('Error fetching ticket data:', error.message);
            throw error;
        }
    }
}

module.exports = TicketModel;