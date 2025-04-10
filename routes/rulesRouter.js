const express = require('express');
const router = express.Router();

const rulesController = require('../controllers/RulesController');

router.get('/', rulesController.rulesData);

module.exports = router;