const { logger } = require('../logger');
const maintenanceService = require('../services/maintenanceService');

class MaintenanceController {
    // Fetch website status
    async getWebsiteStatusData(req, res) {
        try {
            const statusData = await maintenanceService.getWebsiteStatusData();
            return res.status(200).send( statusData );
        } catch (error) {
            console.error('Error fetching website status:', error.message);
            logger.error(`Error fetching website status: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new MaintenanceController();