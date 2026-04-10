const matchIdModel = require('../models/matchIdModel');
const sendMail = require('../helpers/sendMail');

class MatchIdService {
    static async demoSitesListing(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const siteData =
                await matchIdModel.demoSitesListingData(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.demoSitesListingCount();
    
            return { siteData, totalCount };
    
        } catch (error) {
            console.error('Error in Demo Sites Service:', error.message);
            throw new Error('Failed to fetch demo sites');
        }
    }
    
    static async checkExistingPendingRequest(userId, siteId) {
        try {
            return await matchIdModel.checkExistingPendingRequest(
                userId,
                siteId
            );
        } catch (error) {
            console.error('Error checking existing match id request:', error.message);
            throw new Error('Failed to check existing match id request');
        }
    }
    
    static async createMatchIdRequest(userId, siteId, requestedAmount) {
        try {
            // insert request
            const matchIdReqId = await matchIdModel.insertMatchIdRequest(
                userId,
                siteId,
                requestedAmount
            );
    
            // fetch user + site details
            const user = await matchIdModel.getUserSiteDetails(userId, siteId);
    
            if (user) {
    
                const emailContent = `
                    <h3>New Match ID Request</h3>
                    <p><strong>User:</strong> ${user.first_name} ${user.last_name} (${user.phone})</p>
                    <p><strong>Site Name:</strong> ${user.site_name}</p>
                    <p><strong>Requested Amount:</strong> ₹${requestedAmount}</p>
                    <p><strong>Transfer Type:</strong> New ID (APP -> ID)</p>
                `;
    
                try {
                    await sendMail(
                        'matchid459@gmail.com',
                        'New Match ID Request',
                        emailContent
                    );
                } catch (mailErr) {
                    console.error('Email sending failed:', mailErr.message);
                }
            }
    
            return matchIdReqId;
        } catch (error) {
            console.error('Error in Match ID Service:', error.message);
            throw new Error('Failed to create match id request');
        }
    }
    
    static async getUserMatchIds(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const matchData =
                await matchIdModel.getUserMatchIdsData(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.getUserMatchIdsCount(userId);
    
            return { matchData, totalCount };
    
        } catch (error) {
            console.error('Error in MatchID Service:', error.message);
            throw new Error('Failed to fetch match ids');
        }
    }
    
    static async checkExistingTransferReq(userId, siteId, transferType) {
        try {
            return await matchIdModel.checkExistingTransferReq(userId, siteId, transferType);
        } catch (error) {
            console.error('Error checking existing transfer request:', error.message);
            throw new Error('Failed to check existing transfer request');
        }
    }
    
    static async createTransferReq(userId, siteId, transferType, amount) {
        try {
            // Insert transfer request
            const result = await matchIdModel.insertTransferReq(
                userId,
                siteId,
                transferType,
                amount
            );
    
            // Fetch user + site details
            const user = await matchIdModel.getUserSiteDetails(userId, siteId);
    
            if (user) {
    
                const emailContent = `
                    <h3>New Transfer Request</h3>
                    <p><strong>User:</strong> ${user.first_name} ${user.last_name} (${user.phone})</p>
                    <p><strong>Site Name:</strong> ${user.site_name}</p>
                    <p><strong>Requested Amount:</strong> ₹${amount}</p>
                    <p><strong>Transfer Type:</strong> ${transferType}</p>
                `;
    
                try {
                    await sendMail(
                        'matchid459@gmail.com',
                        'New Transfer Request',
                        emailContent
                    );
                } catch (mailErr) {
                    console.error('Email sending failed:', mailErr.message);
                }
            }
    
            return result;
    
        } catch (error) {
            console.error('Error in Transfer Service:', error.message);
            throw new Error('Failed to create transfer request');
        }
    }
    
    static async supportChatsListing(userId) {
        try {
            return await matchIdModel.supportChatsListing(userId);
        } catch (error) {
            console.error('Error in Support Chat Service:', error.message);
            throw new Error('Failed to fetch support chats');
        }
    }
    static async getConsecutiveUserMessages(userId) {
        try {
            return await matchIdModel.getConsecutiveUserMessages(userId);
        } catch (error) {
            console.error('Error checking consecutive messages:', error.message);
            throw new Error('Failed to validate consecutive messages');
        }
    }
    
    static async sendSupportMessage(userId, message) {
        try {
            return await matchIdModel.insertSupportMessage( userId, message );
        } catch (error) {
            console.error('Error in Support Message Service:', error.message);
            throw new Error('Failed to send support message');
        }
    }
    
    // ================= TRANSFER HISTORY =================
    static async transferHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const history =
                await matchIdModel.transferHistoryListing(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.transferHistoryCount(userId);
    
            return { history, totalCount };
    
        } catch (error) {
            console.error('Error in Transfer History Service:', error.message);
            throw new Error('Failed to fetch transfer history');
        }
    }
    
    static async cancelTransferRequest(transfer_id) {
        try {
            return await matchIdModel.cancelTransferRequest(transfer_id );
        } catch (error) {
            console.error('Error in Support Message Service:', error.message);
            throw new Error('Failed to send support message');
        }
    }
}

module.exports = MatchIdService;