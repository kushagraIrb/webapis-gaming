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

// GET /api/features/test -> { status: true, data: { version: 'new' | 'old', message } }
// The harmless feature "Feature Launch Test" (Admin Area > Feature Launch) for trying a launch by hand: the user
// website page /feature-test shows this answer. It is the same server-side check a real feature uses.
// REMOVE with the page /feature-test (Gaming-Helper src/pages/FeatureTest.tsx) when it is no longer needed.
router.get('/test', async (req, res) => {
    const on = await featureModel.isLiveForUser('feature_launch_test', req.user_id);
    return res.status(200).send({
        status: true,
        data: {
            version: on ? 'new' : 'old',
            message: on ? 'The new version is switched on for you.' : 'You are still on the old version.',
        },
    });
});

module.exports = router;
