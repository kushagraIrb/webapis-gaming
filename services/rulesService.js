const rulesModel = require('../models/rulesModel');

class RulesService {
    // Get About Us data by ID
    static async getDataById() {
        try {
            const rulesData = await rulesModel.getDataById();
            return rulesData;
        } catch (error) {
            console.error('Error fetching about us data:', error.message);
            throw new Error('Failed to about us');
        }
    }
}

module.exports = RulesService;