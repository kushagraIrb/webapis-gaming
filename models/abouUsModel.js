const db = require('../config/database');

class abouUsModel {
    // Get "About Us" data by ID
    static async getDataById() {
        const query = `SELECT * FROM tbl_pages WHERE id = 1 ORDER BY id ASC`;
        try {
            const [rows] = await db.promise().query(query);
            return rows[0]; // Return the first row from the query result
        } catch (error) {
            console.error('Error fetching About Us data:', error.message);
            throw new Error('Failed to fetch About Us data from the database');
        }
    }
}

module.exports = abouUsModel;