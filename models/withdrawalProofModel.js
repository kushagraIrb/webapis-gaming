const db = require('../config/database');

class WithdrawalModel {
    static async fetchLatest75Records(limit, offset) {
        const query = `
            SELECT 
                w.user_id,
                w.withdrawal_amount AS amount,
                CONCAT(
                    TRIM(r.first_name),
                    ' ',
                    TRIM(r.last_name)
                ) AS name,
                CONCAT('********', RIGHT(r.phone, 2)) AS phone
            FROM tbl_withdrawal w
            JOIN tbl_registration r ON r.id = w.user_id
            WHERE w.status = 1
            ORDER BY w.id DESC
            LIMIT ? OFFSET ?
        `;
    
        // Here limit will be 5, offset = (page-1)*5
        const [rows] = await db.promise().query(query, [limit, offset]);
        return rows;
    }

    static async getTotalWithdrawalCount() {
        const query = `
            SELECT LEAST(COUNT(*), 75) AS total
                FROM tbl_withdrawal
                WHERE status = 1
        `;

        const [rows] = await db.promise().query(query);
        return rows[0].total;
    }
}

module.exports = WithdrawalModel;