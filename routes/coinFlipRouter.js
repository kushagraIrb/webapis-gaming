const express = require('express');
const router = express.Router();

const coinFlipController = require('../controllers/CoinFlipController');
const authenticateToken = require('../helpers/authToken');

router.post('/create-winner', coinFlipController.createWinner);
router.get('/current-server-time', coinFlipController.getServerTime);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/current-match', coinFlipController.currentMatchDetails);
router.get('/user-past-results', coinFlipController.userPastResults);

router.get('/user-bet-history', coinFlipController.userBetHistory);

router.post('/save-bet', coinFlipController.saveCoinBet);

router.get('/history', coinFlipController.coinFlipHistory);


module.exports = router;