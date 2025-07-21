const { logger } = require('../logger');
const liveBetService = require('../services/liveBetService');
const dashboardService = require('../services/dashboardService');

class DashboardController {
    async userDashboard(req, res) {
        try {
            const user_id  = req.user_id;

            const [
                totalBalance,
                totalWithdrawal,
                totalDeposit,
                playedStats,
                totalProfit,
                totalBetsWin,
                walletHistory,
                winLossStats
            ] = await Promise.all([
                liveBetService.calculateWalletAmount(user_id),
                dashboardService.getTotalWithdrawal(user_id),
                dashboardService.getTotalDeposit(user_id),
                dashboardService.getTotalPlayedStats(user_id),
                dashboardService.calculateProfit(user_id),
                dashboardService.getTotalBetsWin(user_id),
                dashboardService.getWalletHistory(user_id, 10),
                dashboardService.getWinLossPercentage(user_id),
            ]);

            const {
                total_played_amount,
                total_played_count
            } = playedStats;

            return res.status(200).send({
                totalBalance: parseFloat(totalBalance),
                totalWithdrawal: parseFloat(totalWithdrawal),
                totalDeposit: parseFloat(totalDeposit),
                totalPlayedAmount: parseFloat(total_played_amount),
                totalPlayedCount: parseInt(total_played_count),
                totalProfit: parseFloat(totalProfit),
                totalBonusCoins: "Coming Soon!",
                totalBetsWin: parseFloat(totalBetsWin),
                walletHistory,
                winLossStats
            });
        } catch (error) {
            logger.error(`Error fetching dashboard data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }
}

module.exports = new DashboardController();