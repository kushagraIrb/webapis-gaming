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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
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
            const { depositAmount } = req.params; // Extract the deposit amount from the URL path
        
            if (!depositAmount || isNaN(depositAmount)) {
                return res.status(400).send({
                    status: false,
                    message: 'A valid deposit amount is required',
                });
            }

            const result = await depositService.getBankAccountByValue(depositAmount);

            return res.status(200).send({
                status: true,
                data: result,
                message: 'Bank account fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching deposit history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching account history',
                error: error.message,
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: error.message,
            });
        }
    }
}

module.exports = new DepositController();