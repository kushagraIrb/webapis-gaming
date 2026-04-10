const express = require('express');
const router = express.Router();

const authenticateToken = require('../helpers/authToken');
const limboController = require('../controllers/LimboController');

router.use(express.json());

router.use(authenticateToken);
router.get('/bet-details', limboController.betDetails);
router.post('/place-bet', limboController.placeBet);

router.get('/history', limboController.limboBetHistory);

module.exports = router;