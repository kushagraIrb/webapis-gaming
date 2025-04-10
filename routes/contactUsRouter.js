const express = require('express');
const router = express.Router();

const contactUsController = require('../controllers/ContactUsController');

router.use(express.json());

router.get('/details', contactUsController.getContactDetails);
router.post('/', contactUsController.contactUs);

module.exports = router;