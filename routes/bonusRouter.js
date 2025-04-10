const express = require('express');
const router = express.Router();

const bonusController = require('../controllers/BonusController');
const authenticateToken = require('../helpers/authToken');

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/list', bonusController.getBonusListing);
router.get('/stats', bonusController.getBonusStats);
router.post('/claim', bonusController.claimBonus);

module.exports = router;