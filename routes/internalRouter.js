const express = require('express');
const router = express.Router();
const internalController = require('../controllers/InternalController');
const internalSecretGuard = require('../helpers/internalSecretGuard');

router.post('/notify', internalSecretGuard, (req, res) => internalController.notify(req, res));

module.exports = router;
