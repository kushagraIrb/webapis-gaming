const homeSliderModel = require('../models/homeSliderModel');

class HomeSliderService {
    static async getHomeSliderData() {
        try {
            const homeSlider = await homeSliderModel.fetchHomeSliderData();
            return homeSlider;
        } catch (error) {
            console.error('Error in homeSlider service:', error.message);
            throw new Error('Failed to about us');
        }
    }
}

module.exports = HomeSliderService;