const db = require('../config/database');

class abouUsModel {
    // Get "Rules" data by ID
    static async getDataById() {
        const query = `SELECT rules FROM tbl_rules WHERE id = 1`;
        try {
            const [rows] = await db.promise().query(query);
            return rows[0];
        } catch (error) {
            console.error('Error fetching rules data:', error.message);
            throw new Error('Failed to fetch rules data from the database');
        }
    }
}

module.exports = abouUsModel;