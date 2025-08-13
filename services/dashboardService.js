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

    static async getWalletHistory(userId) {
        try {
            return await dashboardModel.getWalletHistoryForLastNDays(userId);
        } catch (error) {
            logger.error(`Error in getWalletHistory: ${error.message}`, { stack: error.stack, userId });
            throw new Error('Error fetching wallet history');
        }
    }

    static async getWinLossPercentage(userId) {
        try {
            const { total_win = 0, total_loss = 0 } = await dashboardModel.fetchWinLossCounts(userId);
            const total = parseFloat(total_win) + parseFloat(total_loss);
    
            let winPercentage = "0.00";
            let lossPercentage = "0.00";
    
            if (total > 0) {
                winPercentage = ((total_win / total) * 100).toFixed(2);
                // Ensure total always adds to 100
                lossPercentage = (100 - parseFloat(winPercentage)).toFixed(2);
            }
    
            return { winPercentage, lossPercentage };
        } catch (error) {
            logger.error(`Error in getWinLossPercentage: ${error.message}`, { stack: error.stack });
            throw new Error("Error calculating win/loss percentage");
        }
    }
}

module.exports = DashboardService;