const ticketModel = require('../models/ticketModel');
const moment = require('moment-timezone');

class TicketService {
    // Delete Old Tickets
    static async closeOldTickets(userId) {
        try {
            const tokenList = await ticketModel.getLatestTicketEntries(userId);

            const eligibleTokenNos = [];

            const oneDayAgo = moment().tz("Asia/Kolkata").subtract(1, 'days').format("YYYY-MM-DD HH:mm:ss");

            for (const row of tokenList) {
                const latestEntry = await ticketModel.getLatestTicketByToken(row.token_no);
                const updatedAtIST = moment(latestEntry.modified).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

                if (latestEntry && updatedAtIST < oneDayAgo && latestEntry.read_by_user == 1) {
                    eligibleTokenNos.push(row.token_no);
                }
            }

            const closedCount = await ticketModel.closeTicketsByTokenNos(eligibleTokenNos);

            return { closedCount };
        } catch (error) {
            console.error('Error deleting old tickets in service:', error.message);
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
            return await ticketModel.getTicketHistory(userId, start, perPage);
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