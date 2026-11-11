const express = require('express');
const router = express.Router();

const contactUsController = require('../controllers/ContactUsController');
const limits = require('../helpers/rateLimiters');

router.use(express.json());

router.get('/details', contactUsController.getContactDetails);
router.post('/', limits.contactForm, contactUsController.contactUs);

module.exports = router;