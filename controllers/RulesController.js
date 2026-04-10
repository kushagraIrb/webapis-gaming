const { logger } = require('../logger');
const rulesService = require('../services/rulesService');

class RulesController {
    // Fetch rules data
    async rulesData(req, res) {
        try {
            const rulesData = await rulesService.getDataById();
            // Send the response with the fetched data
            return res.status(200).send(rulesData);
        } catch (error) {
            console.error('Error fetching rules data:', error.message);
            logger.error(`Error fetching rules data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new RulesController();