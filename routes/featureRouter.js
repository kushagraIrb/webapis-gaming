const express = require('express');
const router = express.Router();
const featureModel = require('../models/featureModel');
const authenticateToken = require('../helpers/authToken');

router.use(authenticateToken);

// GET /api/features/mine -> { status: true, data: { features: ['bank_assignment', ...] } }
// The features an admin has switched on for the logged-in user (Admin Area > Feature Launch).
router.get('/mine', async (req, res) => {
    const features = await featureModel.liveKeysForUser(req.user_id);
    return res.status(200).send({ status: true, data: { features } });
});

module.exports = router;
