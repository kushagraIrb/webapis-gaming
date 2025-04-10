const db = require('../config/database');

class UserModel {
    static async getNotificationList() {
        try {
            const query = `SELECT * FROM tbl_notification WHERE status = 1 ORDER BY id DESC`;
            const [result] = await db.promise().query(query);
            return result;
        } catch (error) {
            throw new Error('Error fetching notifications');
        }
    }

    static async getNotificationUserCount(user_id) {
        try {
            const query = `SELECT COUNT(id) AS row_count FROM tbl_notification_user WHERE user_id = ? AND viewed = 0`;
            const [result] = await db.promise().query(query, [user_id]);
            return result[0]; // Return a single object instead of an array
        } catch (error) {
            throw new Error('Error fetching unread notifications count');
        }
    }
    
    static async updateNotificationStatus(user_id) {
        try {
            // Update viewed status to 1
            await db.promise().query(`UPDATE tbl_notification_user SET viewed = 1 WHERE user_id = ?`, [user_id]);
    
            // Fetch the updated unread count
            const query = `SELECT COUNT(id) AS row_count FROM tbl_notification_user WHERE user_id = ? AND viewed = 0`;
            const [result] = await db.promise().query(query, [user_id]);
            return result[0]; // Return updated count
        } catch (error) {
            throw new Error('Error updating notification status');
        }
    }    
}

module.exports = UserModel;