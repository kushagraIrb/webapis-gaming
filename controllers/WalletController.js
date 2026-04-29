const { logger } = require('../logger');
const walletService = require('../services/walletService');

class WalletController {
    // Fetch wallet history for a user
    async fetchWalletHistory(req, res) {
        try {
            const userId  = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { page = 1, perPage = 10 } = req.query; // Query parameters

            // Fetch wallet history or count using the service
            const result = await walletService.fetchWalletHistory(userId, Number(page), Number(perPage));
            const { total_count, walletHistory } = result;

            return res.status(200).send({
                status: true,
                data: walletHistory,
                count: total_count,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(total_count / perPage),
                message: 'Wallet history fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching wallet history:', error.message);
            logger.error(`Error fetching wallet history: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async fetchArchiveFilterOptions(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ status: false, message: 'User ID is required!' });
            }

            const filterOptions = await walletService.fetchArchiveFilterOptions(userId);

            return res.status(200).send({
                status: true,
                filterOptions,
                message: 'Wallet archive filter options fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching wallet archive filter options:', error.message);
            logger.error(`Error fetching wallet archive filter options: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ status: false, message: 'An error occurred', error: error.message });
        }
    }

    async fetchArchiveWalletHistory(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ status: false, message: 'User ID is required!' });
            }

            const { page = 1, perPage = 10, year } = req.query;

            if (!year || !/^\d{4}$/.test(String(year))) {
                return res.status(400).send({
                    status: false,
                    message: 'A valid archive year is required',
                });
            }

            const result = await walletService.fetchArchiveWalletHistory(
                userId,
                Number(year),
                Number(page),
                Number(perPage)
            );
            const { total_count, walletHistory } = result;

            return res.status(200).send({
                status: true,
                data: walletHistory,
                count: total_count,
                selectedYear: Number(year),
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(total_count / perPage),
                message: 'Archive wallet history fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching archive wallet history:', error.message);
            logger.error(`Error fetching archive wallet history: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ status: false, message: 'An error occurred', error: error.message });
        }
    }

    // Fetch total wallet amount for a user
    async fetchWalletAmount(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ status: false, message: 'User ID is required!' });
            }

            // Fetch total wallet amount using the service
            const totalAmount = await walletService.fetchWalletAmount(userId);

            return res.status(200).send({
                status: true,
                totalWalletAmount: totalAmount,
                message: 'Total wallet amount fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching wallet amount:', error.message);
            logger.error(`Error fetching wallet amount: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ status: false, message: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new WalletController();
