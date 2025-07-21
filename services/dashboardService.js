const { logger } = require('../logger');
const dashboardModel = require('../models/dashboardModel');

class DashboardService {
    static async getTotalWithdrawal(userId) {
        try {
            return await dashboardModel.fetchTotalWithdrawal(userId) || 0;
        } catch (error) {
            logger.error(`Error in getTotalWithdrawal: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error calculating total withdrawal');
        }
    }

    static async getTotalDeposit(userId) {
        try {
            return await dashboardModel.fetchTotalDeposit(userId) || 0;
        } catch (error) {
            logger.error(`Error in getTotalDeposit: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error calculating total deposit');
        }
    }

    static async getTotalPlayedStats(userId) {
        try {
            return await dashboardModel.fetchTotalPlayedStats(userId);
        } catch (error) {
            logger.error(`Error in getTotalPlayedStats: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error calculating total played stats');
        }
    }

    static async calculateProfit(userId) {
        try {
            return await dashboardModel.fetchProfitAmount(userId) || 0;
        } catch (error) {
            logger.error(`Error in calculateProfit: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error calculating profit amount');
        }
    }

    static async getTotalBetsWin(userId) {
        try {
            return await dashboardModel.fetchTotalBetsWin(userId) || 0;
        } catch (error) {
            logger.error(`Error in getTotalBetsWin: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error calculating total bets win');
        }
    }

    static async getWalletHistory(userId, days = 10) {
        try {
            return await dashboardModel.getWalletHistoryForLastNDays(userId, days);
        } catch (error) {
            logger.error(`Error in getWalletHistory: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error fetching wallet history');
        }
    }

    static async getWinLossStats(userId) {
        try {
            return await dashboardModel.fetchWinLossPercentage(userId);
        } catch (error) {
            logger.error(`Error in getWinLossStats: ${error.message}`, { stack: error.stack, userId });
            throw new Error("Failed to calculate win/loss stats");
        }
    }
}

module.exports = DashboardService;