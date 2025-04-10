const accountHistoryModel = require('../models/accountHistoryModel');

class AccountHistoryModel {
    // Fetch account history or count for a user
    static async fetchAccountHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            const accountData = await accountHistoryModel.getAccountData(userId, start, perPage);
            const totalCount = await accountHistoryModel.getAccountCount(userId); // Fetch total count
    
            return { accountData, totalCount };
        } catch (error) {
            console.error('Error in Account Service:', error.message);
            throw new Error('Failed to fetch Account history data');
        }
    }    

    // Fetch account history or count for a user
    static async changePrimaryAccount(userId, accountId) {
        try {
            return await accountHistoryModel.changePrimaryAccount(userId, accountId);
        } catch (error) {
            console.error('Error in Account Service:', error.message);
            throw new Error('Failed to update primary account');
        }
    }
}

module.exports = AccountHistoryModel;