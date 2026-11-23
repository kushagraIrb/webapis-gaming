const express = require('express');
const router = express.Router();

const accountHistoryController = require('../controllers/AccountsHistoryController');
const authenticateToken = require('../helpers/authToken');
const limits = require('../helpers/rateLimiters');

router.use(express.json());

// Apply authenticateToken to all routes below this line
router.use(authenticateToken);

router.get('/history', accountHistoryController.fetchAccountHistory);
router.post('/change-primary', limits.accountOtpPerUser, accountHistoryController.changePrimary);
router.post('/soft-delete', limits.accountOtpPerUser, accountHistoryController.softDelete);
router.post('/otp/resend', limits.accountOtpResend, accountHistoryController.resendOtp);
router.post('/primary-account', accountHistoryController.getPrimaryAccount);

module.exports = router;