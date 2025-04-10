const express = require('express');
const router = express.Router();

const aboutUsController = require('../controllers/AboutUsController');

router.get('/', aboutUsController.aboutUsData);

module.exports = router;