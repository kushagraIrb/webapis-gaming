const { logger } = require('../logger');
const bonusService = require('../services/bonusService');

class BonusController {
    // Fetch Bonus list for a user
    async getBonusListing(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query;
    
            const result = await bonusService.fetchBonusListing(userId, Number(page), Number(perPage));
            const { total_count, bonusList } = result;
    
            return res.status(200).send({
                status: true,
                data: bonusList,
                count: total_count,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(total_count / perPage),
                message: 'Bonus list fetched successfully',
            });
        } catch (error) {
            logger.error(`Error fetching bonus list: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching the bonus list',
                error: error.message,
            });
        }
    }

    // Fetch bet stats for a user
    async getBonusStats(req, res) {
        try {
            const userId = req.user_id;
    
            const result = await bonusService.getBonusStats(userId);
    
            return res.status(200).send({
                status: true,
                data: result,
                message: 'Bonus stats fetched successfully',
            });
        } catch (error) {
            logger.error(`Error fetching bonus stats: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching the bonus stats',
                error: error.message,
            });
        }
    }

    // Claim Bonus
    async claimBonus(req, res) {
        try {
            const userId = req.user_id;
            const bonusAmount = parseFloat(req.body.bonus_amount);
    
            // Validate bonus amount
            if (!bonusAmount || isNaN(bonusAmount) || bonusAmount <= 0) {
                return res.status(400).json({ status: false, message: 'Invalid bonus amount. Amount must be greater than zero.' });
            }
    
            // Process bonus claim
            const result = await bonusService.claimBonus(userId, bonusAmount);
            if (!result.success) {
                return res.status(result.status).json({ status: false, message: result.message });
            }
    
            return res.status(200).json({ status: true, message: 'Bonus claimed successfully.' });
        } catch (error) {
            logger.error(`Error claiming bonus: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ status: false, message: 'An unexpected error occurred while claiming the bonus.' });
        }
    }
}

module.exports = new BonusController();