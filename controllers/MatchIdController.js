const { logger } = require('../logger');
const matchIdService = require('../services/matchIdService');
const walletModel = require('../models/walletModel');

class MatchIdController {
    // Fetch demo sites
    async demoSitesListing(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query;
    
            const { siteData, totalCount } =
                await matchIdService.demoSitesListing(
                    userId,
                    Number(page),
                    Number(perPage)
                );
    
            return res.status(200).send({
                status: true,
                data: siteData,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Demo sites fetched successfully',
            });
    
        } catch (error) {
            console.error('Error fetching demo sites:', error.message);
            logger.error(`Error fetching demo sites: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching demo sites',
                error: error.message,
            });
        }
    }
    
    async createMatchIdRequest(req, res) {
        try {
            const userId = req.user_id;
            const { site_id, requested_amount } = req.body;
    
            // 🔹 Basic validation
            if (!site_id || !requested_amount) {
                return res.status(400).send({
                    status: false,
                    message: 'site_id and requested_amount are required'
                });
            }
    
            // 🔹 Wallet balance check
            const totalAmount = await walletModel.getTotalWalletAmount(userId);
    
            if (Number(totalAmount) < Number(requested_amount)) {
                return res.status(400).send({
                    status: false,
                    message: 'Insufficient wallet balance to request Match ID'
                });
            }
    
            // 🔹 Duplicate pending request check
            const exists = await matchIdService.checkExistingPendingRequest(
                userId,
                site_id
            );
    
            if (exists) {
                return res.status(400).send({
                    status: false,
                    message: 'You already have a pending request for this site'
                });
            }
    
            // 🔹 Create request
            await matchIdService.createMatchIdRequest(
                userId,
                site_id,
                requested_amount
            );
    
            return res.status(200).send({
                status: true,
                message: 'Match ID request submitted successfully'
            });
    
        } catch (error) {
            console.error('Error creating match id request:', error.message);
            logger.error(`Error creating match id request: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while submitting match id request',
                error: error.message
            });
        }
    }
    
    async myMatchIds(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query;
    
            const { matchData, totalCount } =
                await matchIdService.getUserMatchIds(
                    userId,
                    Number(page),
                    Number(perPage)
                );
    
            return res.status(200).send({
                status: true,
                data: matchData,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Match IDs fetched successfully'
            });
    
        } catch (error) {
            console.error('Error fetching match ids:', error.message);
            logger.error(`Error fetching match ids: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching match ids',
                error: error.message
            });
        }
    }
    
    async createTransferReq(req, res) {
        try {
            const userId = req.user_id;
            const { requested_amount, site_id, transfer_type } = req.body;
    
            // 🔹 Basic validation
            if (!requested_amount || !site_id || !transfer_type) {
                return res.status(400).send({
                    status: false,
                    message: 'requested_amount, site_id and Transfer Type are required'
                });
            }
    
            // 🔹 Validate Transfer Type enum
            if (!['app_to_id', 'id_to_app'].includes(transfer_type)) {
                return res.status(400).send({
                    status: false,
                    message: 'Invalid Transfer Type. Allowed values: app_to_id, id_to_app'
                });
            }
    
            // 🔹 Wallet balance check (only for app_to_id)
            if (transfer_type === 'app_to_id') {
                const totalAmount = await walletModel.getTotalWalletAmount(userId);
    
                if (Number(totalAmount) < Number(requested_amount)) {
                    return res.status(400).send({
                        status: false,
                        message: 'Insufficient wallet balance for transfer'
                    });
                }
            }
    
            // 🔹 Duplicate pending transfer check via service
            const exists = await matchIdService.checkExistingTransferReq(
                userId,
                site_id,
                transfer_type
            );
    
            if (exists) {
                return res.status(400).send({
                    status: false,
                    message: 'You already have a pending transfer request for this site'
                });
            }
    
            // 🔹 Create transfer request
            await matchIdService.createTransferReq(
                userId,
                site_id,
                transfer_type,
                requested_amount
            );
    
            return res.status(200).send({
                status: true,
                message: 'Transfer request submitted successfully'
            });
    
        } catch (error) {
            console.error('Error creating transfer request:', error.message);
            logger.error(`Error creating transfer request: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while submitting transfer request',
                error: error.message
            });
        }
    }
    
    async supportChatsListing(req, res) {
        try {
            const userId = req.user_id;
    
            const data =
                await matchIdService.supportChatsListing(userId);
    
            return res.status(200).send({
                status: true,
                data: data,
                message: 'Support chats fetched successfully'
            });
    
        } catch (error) {
            console.error('Error fetching support chats:', error.message);
            logger.error(`Error fetching support chats: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching support chats',
                error: error.message
            });
        }
    }
    
    async sendSupportMessage(req, res) {
        try {
            const userId = req.user_id;
            const { message } = req.body;
    
            // 🔹 Validation
            if (!message || message.trim() === '') {
                return res.status(400).send({
                    status: false,
                    message: 'Message is required'
                });
            }
    
            // 🔹 Spam validation (max 3 consecutive user msgs)
            const consecutiveCount = await matchIdService.getConsecutiveUserMessages(userId);
    
            if (consecutiveCount >= 3) {
                return res.status(400).send({
                    status: false,
                    message: 'Please wait for admin reply before sending more messages'
                });
            }
    
            await matchIdService.sendSupportMessage( userId, message.trim() );
    
            return res.status(200).send({
                status: true,
                message: 'Message sent successfully'
            });
    
        } catch (error) {
            console.error('Error sending support message:', error.message);
            logger.error(`Error sending support message: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while sending message',
                error: error.message
            });
        }
    }
    
    
        // ================= TRANSFER HISTORY =================

    async transferHistory(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query;
    
            const { history, totalCount } =
                await matchIdService.transferHistory(
                    userId,
                    Number(page),
                    Number(perPage)
                );
    
            return res.status(200).send({
                status: true,
                data: history,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Transfer history fetched successfully'
            });
    
        } catch (error) {
            console.error('Error fetching transfer history:', error.message);
            logger.error(`Error fetching transfer history: ${error.message}`, {
                stack: error.stack
            });
    
            return res.status(500).send({
                status: false,
                message: 'Failed to fetch transfer history',
                error: error.message
            });
        }
    }

    async cancelTransferRequest(req, res) {
        try {
            const { transfer_id } = req.body;
    
            if (!transfer_id) {
                return res.status(400).send({
                    status: false,
                    message: 'transfer_id is required'
                });
            }
    
            const result = await matchIdService.cancelTransferRequest(transfer_id);
    
            if (result.state === 'already_rejected') {
                return res.status(400).send({
                    status: false,
                    message: 'Request already rejected'
                });
            }
    
            if (result.state === 'already_approved') {
                return res.status(400).send({
                    status: false,
                    message: 'Approved request cannot be cancelled.'
                });
            }
            
            if (result.state === 'in_process') {
                return res.status(400).send({
                    status: false,
                    message: 'Request is in process and cannot be cancelled.'
                });
            }
    
            return res.status(200).send({
                status: true,
                message: 'Request cancelled successfully.'
            });
    
        } catch (error) {
            if (error.message === "TRANSFER_NOT_FOUND") {
                return res.status(404).send({
                    status: false,
                    message: 'Transfer request not found'
                });
            }
    
            console.error('Error cancelling request:', error.message);
            logger.error(`Error cancelling request of match Id transfer history: ${error.message}`, {
                stack: error.stack
            });
    
            return res.status(500).send({
                status: false,
                message: 'Error cancelling request',
                error: error.message
            });
        }
    }
}

module.exports = new MatchIdController();