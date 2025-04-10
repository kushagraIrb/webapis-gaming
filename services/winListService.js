const winListModel = require('../models/winListModel');

class winListService {
    static async getWinListData(page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
    
            // Fetch total count
            const totalCount = await winListModel.countTodayMatches();
    
            // Fetch paginated match list
            const winList = await winListModel.getUpcomingMatch(start, perPage);
    
            return { total_count: totalCount, winList };
        } catch (error) {
            console.error('Error in Win list:', error.stack);
            throw new Error('Failed to fetch win list');
        }
    }
}

module.exports = winListService;