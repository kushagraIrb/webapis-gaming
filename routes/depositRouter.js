const express = require('express');
const router = express.Router();

const upload = require('../helpers/uploads');
const ocrUpload = require('../helpers/ocrUpload');

const depositController = require('../controllers/DepositController');
const ocrController = require('../controllers/OcrController');
const bankAssignmentController = require('../controllers/BankAssignmentController');
const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken to all routes below this line
router.use(authenticateToken);

router.get('/history', depositController.fetchDepositHistory);
router.get('/bank-account/:depositAmount', depositController.getBankAccountByValue);
router.post('/bank-account/assign', bankAssignmentController.assign);
router.post('/bank-account/shown', bankAssignmentController.shown);
router.post('/bank-account/select', bankAssignmentController.select);
router.post('/bank-account/switch', bankAssignmentController.switchAccount);
router.get('/get-pending-requests-count', depositController.getPendingRequestsCount);
router.post('/extract-image', ocrUpload, ocrController.extractImage);
router.post('/save', upload.single('screenshot'), depositController.saveDeposit);
router.post('/save-log', upload.single('screenshot'), depositController.depositLog);

module.exports = router;