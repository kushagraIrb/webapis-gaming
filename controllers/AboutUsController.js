const { logger } = require('../logger');
const aboutUsService = require('../services/aboutUsService');

class AboutUsController {
    // Fetch About Us data
    async aboutUsData(req, res, next) {
        try {
            const aboutUsData = await aboutUsService.getDataById();
            // Send the response with the fetched data
            return res.status(200).send(aboutUsData);
        } catch (error) {
            console.error('Error fetching about us data:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new AboutUsController();