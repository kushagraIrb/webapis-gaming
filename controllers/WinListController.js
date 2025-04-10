const { logger } = require('../logger');
const winListService = require('../services/winListService');

class WinListController {
    // Get todays match
    async getWinList(req, res) {
        try {
            const { page = 1, perPage = 10 } = req.query; // Query parameters

            // Fetch all of today's match
            const result = await winListService.getWinListData(Number(page), Number(perPage));
            const { total_count, winList } = result;

            return res.status(200).send({
                status: true,
                data: winList,
                count: total_count,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(total_count / perPage),
                message: 'Win List fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching win list:', error.message);
            logger.error(`Error fetching win list: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new WinListController();