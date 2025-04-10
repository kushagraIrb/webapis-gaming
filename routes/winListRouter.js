const express = require('express');
const router = express.Router();

const winListController = require('../controllers/WinListController');

router.use(express.json());

router.get('/', winListController.getWinList);

module.exports = router;