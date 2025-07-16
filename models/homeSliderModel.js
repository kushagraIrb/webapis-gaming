const db = require('../config/database');

class homeSliderModel {
    static async fetchHomeSliderData() {
        const query = `SELECT images FROM tbl_home_slider ORDER BY id DESC`;
        try {
            const [rows] = await db.promise().query(query);
            return rows; // return all rows for multiple sliders
        } catch (error) {
            console.error('Error in homeSlider model:', error.message);
            throw new Error('Failed to fetch home Slider data from the database');
        }
    }
}

module.exports = homeSliderModel;