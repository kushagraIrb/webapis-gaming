const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/TicketController');

const upload = require('../helpers/uploads');

const authenticateToken = require('../helpers/authToken');

router.use(express.json());

// Apply authenticateToken middleware to all routes below this line
router.use(authenticateToken);

router.get('/types', ticketController.fetchTicketTypes);

router.put('/close-ticket/:ticket_id', ticketController.closeTicketById);

router.post('/save', upload.single('screenshort'), ticketController.saveTicket);
router.get('/history', ticketController.fetchTicketHistory);
router.post('/reply-history', ticketController.getHistoryDataByTicketID);
router.post('/reply', upload.single('attachment'), ticketController.ticketReply);

module.exports = router;