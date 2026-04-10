const express = require('express');
const router = express.Router();

const homeSliderController = require('../controllers/HomeSliderController');

router.get('/', homeSliderController.homeSlider);

module.exports = router;