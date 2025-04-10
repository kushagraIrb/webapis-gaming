const depositModel = require('../models/depositModel');
const userModel = require('../models/userModel');

class DepositService {
    // Fetch deposit history or count for a user
    static async fetchDepositHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            const deposits = await depositModel.getDepositHistory(userId, start, perPage);
            const totalCount = await depositModel.getDepositCount(userId); // Fetch total count
    
            return { deposits, totalCount };
        } catch (error) {
            console.error('Error in depositService:', error.message);
            throw new Error('Failed to fetch deposit history');
        }
    }    

    // Fetch Admin Bank Account based on the deposit amount
    static async getBankAccountByValue(depositAmount) {
        try {
            return await depositModel.fetchBankAccountByValue(depositAmount);
        } catch (error) {
            console.error('Error in depositModel:', error.message);
            throw new Error('Failed to fetch deposit history');
        }
    }

    // Save deposit for a user
    static async saveDeposit(userId, depositData, file) {
        try {
            const { deposit_id, deposit_amount, deposit_amount_step1, deposit_date, bank_owner_name
            } = depositData;

            const deposit_screenshot = file ? file.filename : null;

            // Check if deposit ID already exists with status 1
            const existingDeposit = await depositModel.getDepositById(deposit_id);
            if (existingDeposit) {
                throw new Error('This screenshot has already been approved. Please try again with a different screenshot.');
            }

            // Prepare deposit data
            const data = {
                userId,
                deposit_id,
                deposit_amount,
                deposit_amount_step1,
                deposit_date,
                deposit_screenshot,
                bank_owner_name
            };

            // Save deposit
            const result = await depositModel.saveDeposit(data);

            if (result) {
                // Fetch bonus_league_id
                const bonusData = await userModel.getBonusIdByUserId(userId);
                const bonus_league_id = bonusData ? bonusData.bonus_league_id : null;

                // Calculate user balance
                const availableBalance = await depositModel.getUserAvailableBalance(userId);
                const totalBalance = parseFloat(deposit_amount_step1) + parseFloat(availableBalance || 0);

                const transData = {
                    transaction_pk: result.insertId,
                    transaction_id: deposit_id,
                    userId,
                    credit_amount: deposit_amount_step1,
                    total_amount: totalBalance,
                    bonus_league_id
                };

                // Add transaction history
                await depositModel.saveTransactionHistory(transData);

                // Update user registration highlight
                await depositModel.updateUserHighlight(userId);

                return {
                    status: true,
                    message: 'Deposit saved successfully and added to the wallet.',
                };
            } else {
                throw new Error('Something went wrong, please try again.');
            }
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw error;
        }
    }

    // Save deposit log for a user
    static async depositLog(userId, depositData, file) {
        try {
            const { deposit_id, deposit_amount, deposit_amount_step1, deposit_date, ss_time_frame, status } = depositData;

            const deposit_screenshot = file ? file.filename : null;

            // Prepare deposit log data
            const data = {
                userId,
                deposit_id,
                deposit_amount,
                deposit_amount_step1,
                deposit_date,
                ss_time_frame,
                status,
                deposit_screenshot
            };

            // Save deposit log
            const result = await depositModel.insertDepositLog(data);

            return {
                status: true,
                message: 'Deposit log saved successfully.',
                data: result,
            };
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw error;
        }
    }
}

module.exports = DepositService;