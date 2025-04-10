const maintenanceModel = require('../models/maintenanceModel');

class MaintenanceService {
    // Get website status
    static async getWebsiteStatusData() {
        try {
            const status = await maintenanceModel.getWebsiteStatusData();
            return status;
        } catch (error) {
            console.error('Error in service while fetching website status:', error.message);
            throw error;
        }
    }
}

module.exports = MaintenanceService;