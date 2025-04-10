const abouUsModel = require('../models/abouUsModel');

class aboutUsService {
    // Get About Us data by ID
    static async getDataById(userId, perPage = null, start = null, isCount = false) {
        try {
            const aboutUsData = await abouUsModel.getDataById();
            return aboutUsData;
        } catch (error) {
            console.error('Error fetching about us data:', error.message);
            throw new Error('Failed to about us');
        }
    }
}

module.exports = aboutUsService;