const ticketModel = require('../models/ticketModel');
const moment = require('moment-timezone');

class TicketService {
    // Delete Old Ticket
    static async closeTicketById(ticketId) {
        try {
            const ticket = await ticketModel.getTicketById(ticketId);

            if (!ticket || !ticket.token_no) {
                const err = new Error('Ticket not found or missing token number.');
                err.statusCode = 404;
                throw err;
            }

            const closedCount = await ticketModel.closeTicketsByTokenNos([ticket.token_no]);

            return { closedCount };
        } catch (error) {
            console.error('Error in service while closing ticket:', error.message);
            throw error;
        }
    }

    // Fetch ticket types
    static async getTicketTypes() {
        try {
            return await ticketModel.getTicketTypes();
        } catch (error) {
            console.error('Error fetching ticket history:', error.message);
            throw new Error('Failed to fetch ticket history');
        }
    }
  
    // Save a new ticket
    static async saveTicket(ticketData) {
        try {
            // Step 1: Delete all tickets of this user where status = 'Close'
            const deletedTicktes = await ticketModel.deleteClosedTicketsByUser(ticketData.userBy);

            // Step 2: Insert the new ticket
            const insertResult = await ticketModel.insertTicket(ticketData);

            if (insertResult) {
                const tokenNo = `${Math.floor(100000 + Math.random() * 900000)}${insertResult.insertId}`;
                await ticketModel.updateTicketWithToken(insertResult.insertId, tokenNo);
                return { status: true, tokenNo };
            }
            return null;
        } catch (error) {
            console.error('Error saving ticket in service:', error.message);
            throw error;
        }
    }

    // Fetch ticket history for a user
    static async getTicketHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
            const [rows, count] = await ticketModel.getTicketHistory(userId, start, perPage);
            return [rows, count]; 
        } catch (error) {
            console.error('Error fetching ticket history:', error.message);
            throw new Error('Failed to fetch ticket history');
        }
    }

    static async saveTicketReply(ticketData) {
        try {
            await ticketModel.insertTicketReply(ticketData);
    
            return { status: true };
        } catch (error) {
            console.error('Error saving ticket reply:', error.message);
            throw error;
        }
    }

    static async getHistoryDataByTicketID(token_no, user_id) {
        try {
            return await ticketModel.fetchHistoryDataByTicketID(token_no, user_id);
        } catch (error) {
            console.error('Error in service while fetching ticket data:', error.message);
            throw error;
        }
    }
}

module.exports = TicketService;