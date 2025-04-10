const express = require('express');
const router = express.Router();

const eventsController = require('../controllers/EventsController');

router.use(express.json());

router.get('/', eventsController.events);
router.get('/details/:id', eventsController.eventsDetails);

module.exports = router;