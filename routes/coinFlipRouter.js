const express = require('express');
const router = express.Router();

const coinFlipController = require('../controllers/CoinFlipController');
const authenticateToken = require('../helpers/authToken');

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/current-match', coinFlipController.currentMatchDetails);
router.get('/user-past-results', coinFlipController.userPastResults);
router.get('/save-bet', coinFlipController.saveCoinBet);

module.exports = router;