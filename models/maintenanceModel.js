const db = require('../config/database');

class MaintenanceModel {
    // Get website status
    static async getWebsiteStatusData() {
        const query = `SELECT title, date, time, status FROM tbl_website_on_off LIMIT 1`; // Fetch the first row
        try {
            const [rows] = await db.promise().query(query);
            return rows.length > 0 ? rows[0] : null; // Return the 'status' field from the first row
        } catch (error) {
            console.error('Error fetching website status:', error.message);
            throw new Error('Failed to fetch website status from the database');
        }
    }
}

module.exports = MaintenanceModel;