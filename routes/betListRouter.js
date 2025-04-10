const express = require('express');
const router = express.Router();

const betListController = require('../controllers/BetListController');
const authenticateToken = require('../helpers/authToken');

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/', betListController.getBettingOrderList);

module.exports = router;