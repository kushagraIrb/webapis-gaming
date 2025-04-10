const express = require('express');
const router = express.Router();

const gamingNotificationUpload = require('../helpers/gamingNotifImg');

const authenticateToken = require('../helpers/authToken');
const notificationController = require('../controllers/NotificationController');

router.use(express.json());

router.get('/', notificationController.notificationList);

router.post('/gaming-notif-img', gamingNotificationUpload.single('notification_image'), notificationController.gamingNotifImg);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/user-count', notificationController.notificationUserCount);
router.get('/update-status', notificationController.updateNotificationStatus);

module.exports = router;