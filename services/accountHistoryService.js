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

    static async softDeleteAccount(userId, accountId) {
        try {
            // First check if the account is primary
            const account = await accountHistoryModel.getAccountById(userId, accountId);

            if (!account) {
                throw new Error('Account not found');
            }

            if (account.primary_account === 1) {
                // Primary account cannot be deleted
                return false;
            }

            // Proceed with soft delete
            const result = await accountHistoryModel.softDeleteAccount(userId, accountId);
            return result;

        } catch (error) {
            console.error('Error in softDeleteAccount service:', error.message);
            throw error;
        }
    }

    //Get Primary Account Details
    static async getPrimaryAccount(userId) {
        try {
            const primaryAccount = await accountHistoryModel.getPrimaryAccount(userId);

            if (!primaryAccount) {
                return { success: false, message: 'No primary account found' };
            }

            return { success: true, data: primaryAccount };
        } catch (error) {
            console.error('Error in getPrimaryAccount service:', error.message);
            throw new Error('Failed to fetch primary account details');
        }
    }

}

module.exports = AccountHistoryModel;