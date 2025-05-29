const { logger } = require('../logger');
const ticketService = require('../services/ticketService');

class TicketController {
    // Delete Old Tickets
    async closeOldTickets(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }
            
            const result = await ticketService.closeOldTickets(userId);

            return res.status(200).json({
                status: true,
                message: `${result.closedCount} old tickets closed successfully.`,
            });
        } catch (error) {
            console.error('Error deleting old tickets:', error.message);
            logger.error(`Error deleting old tickets: ${error.message}`, { stack: error.stack });

            return res.status(500).json({
                status: false,
                message: 'Something went wrong while deleting tickets. Please try again.',
            });
        }
    }

    // Fetch ticket types
    async fetchTicketTypes(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }
            
            // Fetch ticket types
            const ticketTypes = await ticketService.getTicketTypes();

            return res.status(200).send({
                status: true,
                data: ticketTypes
            });
        } catch (error) {
            console.error('Error fetching ticket history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
  
    async saveTicket(req, res) {
        try {
            const { issues, message } = req.body;
            const attachment = req.file ? req.file.filename : null;
            const userBy = req.user_id;

            if (!issues || !message) {
                return res.status(400).json({ status: false, message: 'Issue and Message are required!' });
            }

            const ticketData = {
                issues,
                remarks: message.trim(),
                attachment,
                status: 'Open',
                userBy,
                read_msg: 1,
                read_by_user: 0,
            };

            // Save ticket
            const result = await ticketService.saveTicket(ticketData);
            if (result) {
                return res.status(201).json({ status: true, message: 'Ticket generated successfully!', token_no: result.tokenNo });
            } else {
                throw new Error('Failed to save ticket.');
            }
        } catch (error) {
            console.error('Error saving ticket:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }

    // Fetch ticket history for a user
    async fetchTicketHistory(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { page = 1, perPage = 10 } = req.query;

            // Fetch ticket history
            const ticketHistory = await ticketService.getTicketHistory(userId, Number(page), Number(perPage));

            return res.status(200).send({
                status: true,
                data: ticketHistory,
                message: 'ticket history fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching ticket history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async ticketReply(req, res) {
        try {
            const user_id = req.user_id;

            const { token_no, status, issues_id, editor } = req.body;
            const attachment = req.file ? req.file.filename : null;
    
            if (!editor) {
                return res.status(400).json({ status: false, message: 'Remark is required!' });
            }
    
            const ticketData = {
                token_no,
                issues: issues_id,
                remarks: editor.trim(),
                attachment,
                status,
                userBy: user_id,
                read_msg: 1,
                read_by_user: 0
            };
    
            // Save to DB
            const result = await ticketService.saveTicketReply(ticketData);
            if (result) {
                return res.status(201).json({ status: true, message: 'Reply saved successfully!', token_no: token_no });
            } else {
                throw new Error('Failed to save ticket reply.');
            }
        } catch (error) {
            console.error('Error saving reply:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }

    async getHistoryDataByTicketID(req, res) {
        try {
            const user_id = req.user_id; // Extracted from JWT
            const { token_no } = req.body; // Extracted from request body
    
            if (!token_no) {
                return res.status(400).json({ status: false, message: 'Token number is required!' });
            }
    
            // Fetch ticket data
            const ticketData = await ticketService.getHistoryDataByTicketID(token_no, user_id);
    
            if (ticketData.length > 0) {
                return res.status(200).json({ status: true, data: ticketData });
            } else {
                return res.status(404).json({ status: false, message: 'No ticket found with the given token number.' });
            }
        } catch (error) {
            console.error('Error fetching ticket data:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }
}

module.exports = new TicketController();