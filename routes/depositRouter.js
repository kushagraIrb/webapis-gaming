const express = require('express');
const router = express.Router();

const upload = require('../helpers/uploads');

const depositController = require('../controllers/DepositController');
const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// CRON
router.post('/bank-system-reset', depositController.resetBankSystem);

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/history', depositController.fetchDepositHistory);
router.get('/bank-account/:depositAmount', depositController.getBankAccountByValue);
router.get('/get-pending-requests-count', depositController.getPendingRequestsCount);
router.get('/debug-pending-requests', depositController.getPendingDepositDiagnostics);
router.post('/save', upload.single('screenshot'), depositController.saveDeposit);
router.post('/save-log', upload.single('screenshot'), depositController.depositLog);

module.exports = router;
