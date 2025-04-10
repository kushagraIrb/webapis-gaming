const express = require('express');
const router = express.Router();

const liveBetController = require('../controllers/LiveBetController');
const authenticateToken = require('../helpers/authToken');

router.get('/home-listing', liveBetController.homeListing);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/', liveBetController.liveBet);
router.post('/save', liveBetController.saveBet);
router.post('/cancel', liveBetController.cancelBet);
router.get('/extra-time-list', liveBetController.extraTimeList);
router.get('/:encrypted_id', liveBetController.getMatchDetails);

module.exports = router;