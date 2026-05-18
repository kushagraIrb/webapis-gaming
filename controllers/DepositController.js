const { logger } = require('../logger');
const depositService = require('../services/depositService');

class DepositController {
    // Fetch deposit history for a user
    async fetchDepositHistory(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query; // Query parameters

            // Fetch deposit history and count using the service
            const { deposits, totalCount } = await depositService.fetchDepositHistory(userId, Number(page), Number(perPage));

            return res.status(200).send({
                status: true,
                message: deposits.length > 0 ? 'Account history fetched successfully' : 'No deposit history available',
                data: deposits,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
            });
        } catch (error) {
            console.error('Error fetching deposit history:', error.message);
            logger.error(`Error fetching deposit history: ${error.message}`, { stack: error.stack });
            
            return res.status(404).send({
                status: false,
                message: 'An error occurred while fetching account history',
                error: error.message,
            });
        }
    }

    // Fetch Admin Bank Account based on the deposit amount
    async getBankAccountByValue(req, res) {
        try {
            const { depositAmount } = req.params;
    
            if (!depositAmount || isNaN(depositAmount)) {
                return res.status(400).send({
                    status: false,
                    message: 'A valid deposit amount is required',
                });
            }
    
            const result = await depositService.getBankAccountByValue(depositAmount);
        
            // handle failure response
            if (!result?.success) {
                return res.status(400).send({
                    status: false,
                    message: result?.message || 'Unable to fetch bank details'
                });
            }
    
            // ✅ IMPORTANT FIX HERE
            return res.status(200).send({
                status: true,
                data: result.data,
                message: 'Bank account fetched successfully',
            });
    
        } catch (error) {
            console.error('Error fetching deposit history:', error.message);
            logger.error(`Error fetching deposit history: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching account history',
                error: error.message,
            });
        }
    }

    async resetBankSystem(req, res) {
        try {
            const result = await depositService.resetBankSystem();
    
            return res.status(200).send({
                status: true,
                message: 'Bank system reset successfully',
                data: result
            });
    
        } catch (error) {
            console.error(error);
            return res.status(500).send({
                status: false,
                message: 'Reset failed',
                error: error.message
            });
        }
    }

    // Save deposit for a user
    async saveDeposit(req, res) {
        try {
            const userId = req.user_id;
            const result = await depositService.saveDeposit(userId, req.body, req.file);

            return res.status(200).send(result);
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error saving deopsit: ${error.message}`, { stack: error.stack });
            }

            return res.status(statusCode).send({
                status: false,
                message: error.message,
            });
        }
    }

    // Save deposit log for a user
    async depositLog(req, res) {
        try {
            const userId = req.user_id;
            const result = await depositService.depositLog(userId, req.body, req.file);

            return res.status(200).send(result);
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error saving deposit: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                status: false,
                message: error.message || 'Something went wrong',
            });
        }
    }

    async getPendingRequestsCount(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: 'User ID is required' });
            }

            const result = await depositService.getPendingRequestsCount(userId);
            return res.status(200).json({ status: true, pending_requests_count: result });
        } catch (error) {
            logger.error(`Error fetching pending deposit requests count: ${error.message}`, { stack: error.stack });
            return res.status(500).json({
                status: false,
                message: 'Something went wrong, please try again.',
            });
        }
    }

    async getPendingDepositDiagnostics(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: 'User ID is required' });
            }

            const result = await depositService.getPendingDepositDiagnostics(userId);
            return res.status(200).json({ status: true, data: result });
        } catch (error) {
            logger.error(`Error fetching pending deposit diagnostics: ${error.message}`, { stack: error.stack });
            return res.status(500).json({
                status: false,
                message: 'Something went wrong, please try again.',
            });
        }
    }
}

module.exports = new DepositController();
