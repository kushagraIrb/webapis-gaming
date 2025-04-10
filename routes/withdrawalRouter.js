const express = require('express');
const router = express.Router();
const withdrawalController  = require('../controllers/WithdrawalController');

const authenticateToken = require('../helpers/authToken');

router.use(express.json());

router.get('/form-status', withdrawalController.withButtonStatus);

/******** Fast withdrawal ********/
router.get('/get-fast-withdrawal-details', withdrawalController.getfastWithdrawalDetails);
/******** End Fast withdrawal ********/

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/get-date', withdrawalController.getLastWithdrawalDateById);

/******** Withdrawal ********/
router.post('/save-request', withdrawalController.saveWithdrawal);
router.get('/history', withdrawalController.listWithdrawalHistory);
router.get('/cancel-request/:id', withdrawalController.cancelRequest);
/******** End Withdrawal ********/

/******** Fast withdrawal ********/
router.get('/get-durationTimer', withdrawalController.getDurationTimer);
router.post('/save-fast-request', withdrawalController.saveFastWithdrawal);
/******** End Fast withdrawal ********/

module.exports = router;