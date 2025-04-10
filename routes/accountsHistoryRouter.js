const express = require('express');
const router = express.Router();

const accountHistoryController = require('../controllers/AccountsHistoryController');
const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/history', accountHistoryController.fetchAccountHistory);
router.post('/change-primary', accountHistoryController.changePrimary);

module.exports = router;