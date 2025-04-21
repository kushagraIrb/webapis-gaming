const express = require('express');
const router = express.Router();

const limboController = require('../controllers/LimboController');

router.use(express.json());

router.get('/bet-details', limboController.betDetails);
router.post('/place-bet', limboController.placeBet);

module.exports = router;