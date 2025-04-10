const walletModel = require('../models/walletModel');

class WalletService {
    // Fetch wallet history or count for a user
    static async fetchWalletHistory(userId, page, perPage, isCount) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination

            // Fetch total count
            const totalCount = await walletModel.countWalletHistory(userId);

            // Fetch paginated bet list
            const walletHistory = await walletModel.getWalletHistory(userId, start, perPage);

            return { total_count: totalCount, walletHistory };
        } catch (error) {
            console.error('Error in WalletService:', error.message);
            throw new Error('Failed to fetch wallet history');
        }
    }

    // Fetch total wallet amount for a user
    static async fetchWalletAmount(userId) {
        try {
            const totalAmount = await walletModel.getTotalWalletAmount(userId);
            return totalAmount;
        } catch (error) {
            console.error('Error in WalletService:', error.message);
            throw new Error('Failed to fetch wallet amount');
        }
    }
}

module.exports = WalletService;