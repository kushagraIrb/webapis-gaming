const { logger } = require('../logger');
const homeSliderService = require('../services/homeSliderService');

class HomeSliderController {
    async homeSlider(req, res, next) {
        try {
            const homeSlider = await homeSliderService.getHomeSliderData();

            const images = homeSlider.map(item => item.images);

            return res.status(200).send(images);
        } catch (error) {
            console.error('Error in homeSlider controller:', error.message);
            logger.error(`Error in homeSlider controller: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new HomeSliderController();