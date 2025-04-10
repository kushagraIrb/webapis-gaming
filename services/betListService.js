const betListModel = require('../models/betListModel');

class BetService {
    // Fetch bet list or count
    static async fetchBettingOrderList(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            
            // Fetch total count
            const totalCount = await betListModel.getBetCount(userId);

            // Fetch paginated bet list
            const betList = await betListModel.getBetList(userId, start, perPage);

            return { total_count: totalCount.total_count, betList };
        } catch (error) {
            console.error('Error in BetService:', error.message);
            throw new Error('Failed to fetch betting order list');
        }
    }

    static async isMatchWinnerAnnounced(matchId) {
        try {
            const result = await betListModel.isMatchWinnerAnnounced(matchId);
            return result.length > 0 ? result : null; // Check if results exist
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced service:', error.message);
            throw new Error('Failed to check if match winner is announced.');
        }
    }

    static async winnerTeamByMatch(matchId, teamId) {
        try {
            const result = await betListModel.winnerTeamByMatch(matchId, teamId);
            return result.length > 0 ? result : null; // Check if results exist
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced service:', error.message);
            throw new Error('Failed to check if match winner is announced.');
        }
    }
}

module.exports = BetService;