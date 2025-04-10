const express = require('express');
const router = express.Router();

const closeBetController = require('../controllers/CloseBetController');

const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/', closeBetController.fetchCloseBetHistory);

module.exports = router;