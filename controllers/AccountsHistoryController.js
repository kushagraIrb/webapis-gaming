const { logger } = require('../logger');
const accountHistoryService = require('../services/accountHistoryService');

class AccountHistoryController {
    // Fetch account history for a user
    async fetchAccountHistory(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query; // Query parameters

            // Fetch account history or count using the service
            const { accountData, totalCount } = await accountHistoryService.fetchAccountHistory(userId, Number(page), Number(perPage));

            return res.status(200).send({
                status: true,
                data: accountData,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Account history fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching account history:', error.message);
            logger.error(`Error fetching account history: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching account history',
                error: error.message,
            });
        }
    }

    // Change primary account for a user
    async changePrimary(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { account_id } = req.body; // Ensure these values come from the request body

            if (!account_id) {
                return res.status(400).send({ msg: 'Account ID are required!' });
            }

            const result = await accountHistoryService.changePrimaryAccount(userId, account_id);

            return res.status(200).send({
                status: true,
                data: result,
                message: 'Primary account updated successfully',
            });
        } catch (error) {
            console.error('Error changing primary account:', error.message);
            logger.error(`Error changing primary account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while changing the primary account',
                error: error.message,
            });
        }
    }


    async softDelete(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { account_id } = req.body;

            if (!account_id) {
                return res.status(400).send({ msg: 'Account ID is required!' });
            }

            // Call the service
            const result = await accountHistoryService.softDeleteAccount(userId, account_id);

            // If the service returned false, it means the account is primary
            if (result === false) {
                return res.status(400).send({
                    status: false,
                    message: 'You cannot delete the primary account.',
                });
            }

            // If deletion was successful
            return res.status(200).send({
                status: true,
                message: 'Account deleted successfully.',
            });

        } catch (error) {
            console.error('Error soft deleting account:', error.message);
            logger.error(`Error soft deleting account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while deleting account as soft.',
                error: error.message,
            });
        }
    }

    // FUNCTION: Get Primary Account Details
    async getPrimaryAccount(req, res) {
        try {
            const userId = req.user_id;

            const result = await accountHistoryService.getPrimaryAccount(userId);

            if (!result.success) {
                return res.status(404).send({
                    status: false,
                    message: result.message || 'Primary account not found',
                });
            }

            return res.status(200).send({
                status: true,
                data: result.data,
                message: 'Primary account fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching primary account:', error.message);
            logger?.error(`Error fetching primary account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching primary account',
                error: error.message,
            });
        }
    }


}

module.exports = new AccountHistoryController();