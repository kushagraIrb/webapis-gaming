const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/DashboardController');
const authenticateToken = require('../helpers/authToken');

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/', dashboardController.userDashboard);

module.exports = router;