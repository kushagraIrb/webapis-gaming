const walletModel = require('../models/walletModel');

class WalletService {
    // Fetch wallet history or count for a user
    static async fetchWalletHistory(userId, page, perPage) {
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

    static async fetchArchiveWalletHistory(userId, year, page, perPage) {
        try {
            const start = (page - 1) * perPage;
            const totalCount = await walletModel.countArchiveWalletHistory(userId, year);
            const walletHistory = await walletModel.getArchiveWalletHistory(userId, year, start, perPage);

            return { total_count: totalCount, walletHistory };
        } catch (error) {
            console.error('Error in fetchArchiveWalletHistory:', error.message);
            throw new Error('Failed to fetch archive wallet history');
        }
    }

    static async fetchArchiveFilterOptions(userId) {
        try {
            const archiveYears = await walletModel.getArchiveFilterYears(userId);
            return archiveYears.map((year) => ({
                label: String(year),
                value: String(year),
                source: 'archive',
            }));
        } catch (error) {
            console.error('Error in fetchArchiveFilterOptions:', error.message);
            throw new Error('Failed to fetch archive filter options');
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
