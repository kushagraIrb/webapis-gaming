const express = require('express');
const router = express.Router();
const withdrawalProofController  = require('../controllers/withdrawalProofController');

router.use(express.json());

router.get('/latest-records', withdrawalProofController.latest75Records);

module.exports = router;