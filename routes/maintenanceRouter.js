const express = require('express');
const router = express.Router();

const maintenanceController = require('../controllers/MaintenanceController');

router.get('/', maintenanceController.getWebsiteStatusData);

module.exports = router;