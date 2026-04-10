const express = require('express');
const router = express.Router();

const matchIdController = require('../controllers/MatchIdController');
const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken middleware
router.use(authenticateToken);

// Demo Page
router.get('/demo-sites', matchIdController.demoSitesListing);
router.post('/get-id', matchIdController.createMatchIdRequest);

// My ID Page
router.get('/my-ids', matchIdController.myMatchIds);
router.post('/transfer-req', matchIdController.createTransferReq);

// Support Chat Page
router.get('/support-chats', matchIdController.supportChatsListing);
router.post('/send-chat', matchIdController.sendSupportMessage);

// TRANSFER HISTORY
router.get('/transfer-history', matchIdController.transferHistory);

// Cancel Match ID & Transfer Request
router.post('/cancel-req', matchIdController.cancelTransferRequest);

module.exports = router;