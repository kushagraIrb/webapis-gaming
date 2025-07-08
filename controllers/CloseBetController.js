const { logger } = require('../logger');
const closeBetService = require('../services/closeBetService');

class closeBetController {
    // Fetch close bet
    async fetchCloseBetHistory(req, res) {
        try {
            const userId = req.user_id;
    
            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }
    
            const { page = 1, perPage = 10 } = req.query;
            const { closedMatches = [], totalCount = 0 } = await closeBetService.getCloseBetHistory(Number(page), Number(perPage)) || {};
    
            if (!Array.isArray(closedMatches)) {
                console.error("Error: closedMatches is not an array", closedMatches);
                return res.status(500).send({
                    status: false,
                    message: "Internal server error: Data format issue",
                });
            }
    
            if (closedMatches.length === 0) {
                return res.status(200).send({
                    status: true,
                    message: 'No closed matches available',
                    total: totalCount,
                    data: [],
                });
            }
    
            return res.status(200).send({
                status: true,
                data: closedMatches,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Close bet matches fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching close bet matches:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching close bet matches',
                error: error.message,
            });
        }
    }
}

module.exports = new closeBetController();