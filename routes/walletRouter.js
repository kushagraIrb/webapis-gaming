const express = require('express');
const router = express.Router();

const walletController = require('../controllers/WalletController');
const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/history', walletController.fetchWalletHistory);
router.get('/total-amount', walletController.fetchWalletAmount);

module.exports = router;