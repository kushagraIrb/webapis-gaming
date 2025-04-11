const express = require('express');
const router = express.Router();

const coinFlipController = require('../controllers/CoinFlipController');
const authenticateToken = require('../helpers/authToken');

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/current-match', coinFlipController.currentMatch);
router.get('/', coinFlipController.liveBet);
router.post('/save', coinFlipController.saveBet);
router.post('/cancel', coinFlipController.cancelBet);
router.get('/extra-time-list', coinFlipController.extraTimeList);
router.get('/:encrypted_id', coinFlipController.getMatchDetails);

module.exports = router;