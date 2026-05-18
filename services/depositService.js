const depositModel = require('../models/depositModel');
const userModel = require('../models/userModel');
const db = require('../config/database');

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
        return await depositModel.fetchBankAccountByValue(depositAmount);
    }

    static async resetBankSystem() {
        return await depositModel.resetBankSystem();
    }

    // Save deposit for a user
    static async saveDeposit(userId, depositData, file) {
        const conn = await db.promise().getConnection();

        try {
            await conn.beginTransaction();

            const { deposit_id,deposit_amount,deposit_amount_step1,deposit_date,bank_owner_name,group_id } = depositData;

            // Validate required fields
            if ( !deposit_id ||!deposit_amount ||!deposit_amount_step1 ||!deposit_date ||!bank_owner_name ||!group_id) {
                const err = new Error('Some data is missing.');
                err.statusCode = 400;
                throw err;
            }

            const newDepositAmount = parseFloat(deposit_amount_step1);
            if (isNaN(newDepositAmount) || newDepositAmount <= 0) {
                const err = new Error('Invalid deposit amount.');
                err.statusCode = 400;
                throw err;
            }

            // Enforce first-24h total deposit limit for newly registered users
            const userCreatedAt = await depositModel.getUserCreatedAt(userId);
            if (userCreatedAt) {
                const userCreatedMs = new Date(userCreatedAt).getTime();
                const first24hEndsMs = userCreatedMs + (24 * 60 * 60 * 1000);
                const nowMs = Date.now();

                if (nowMs <= first24hEndsMs) {
                    const first24hTotal = await depositModel.getFirst24hDepositTotal(userId, userCreatedAt);
                    if ((first24hTotal + newDepositAmount) > 10000) {
                        const err = new Error('First 24 hours total deposit limit is Rs. 10,000.');
                        err.statusCode = 422;
                        throw err;
                    }
                }
            }

            const deposit_screenshot = file ? file.filename : null;

            // Block duplicate deposit requests while a previous one is pending
            const existingPendingDeposit = await depositModel.findPendingDepositByUserId(userId);
            if (existingPendingDeposit) {
                const err = new Error('Your previous deposit is pending. Please wait for admin approval before making another deposit.');
                err.statusCode = 409;
                throw err;
            }

            // Check if deposit ID already exists with status 1
            const existingDeposit = await depositModel.getDepositById(deposit_id);

            if (existingDeposit) {
                const err = new Error('This screenshot has already been approved. Please try again with a different screenshot.');
                err.statusCode = 409;
                throw err;
            }

            // Atomic consumed amount update
            const updated = await depositModel.updateConsumedAmount(conn, group_id, deposit_amount);

            if (!updated) {
                const err = new Error('Please refresh the page and try again.');
                err.statusCode = 400;
                throw err;
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
            const result = await depositModel.saveDeposit(conn, data);

            if (!result) {
                const err = new Error('Something went wrong, please try again.');
                err.statusCode = 500;
                throw err;
            }

            // Fetch bonus league
            const bonusData = await userModel.getBonusIdByUserId(userId);

            const bonus_league_id = bonusData ? bonusData.bonus_league_id : null;

            // Get user balance
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

            // Save transaction history
            await depositModel.saveTransactionHistory(conn, transData);
            // Update highlight
            await depositModel.updateUserHighlight(conn, userId);
            await conn.commit();

            return {
                status: true,
                message: 'Deposit saved successfully and added to the wallet.',
            };
        } catch (error) {
            await conn.rollback();
            console.error('Error saving deposit:', error.message);
            throw error;
        } finally {
            conn.release();
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

    static async getPendingRequestsCount(userId) {
        try {
            return await depositModel.fetchPendingRequestsCount(userId);
        } catch (error) {
            console.error('Error fetching pending deposit requests count:', error.message);
            throw error;
        }
    }

    static async getPendingDepositDiagnostics(userId) {
        try {
            return await depositModel.getPendingDepositDiagnostics(userId);
        } catch (error) {
            console.error('Error fetching pending deposit diagnostics:', error.message);
            throw error;
        }
    }
}

module.exports = DepositService;
