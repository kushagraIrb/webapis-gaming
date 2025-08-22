const { logger } = require('../logger');
const limboService = require('../services/limboService');

class LimboController {
    async betDetails(req, res) {
        try {
            const userId = req.user_id;
            if (!userId) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }
    
            const bets = await limboService.getUserBets(userId);
    
            return res.status(200).json({
                status: true,
                data: bets,
                message: 'Bets fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching limbo bet details:', error.message);
            logger.error(`Error fetching limbo bet details data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({
                status: false,
                message: 'An error occurred while fetching bet details',
                error: error.message,
            });
        }
    }    

    async placeBet(req, res) {
        try {
            const userId = req.user_id;
            if (!userId) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }
    
            const { bet_type, target_multiplier, win_chance, bet_amount, profit_on_win, number_of_bets, on_wins, on_loss, stop_on_profit, stop_on_loss } = req.body;

            const missingFields = [];
            if (!target_multiplier) missingFields.push('Target Multiplier');
            if (!win_chance) missingFields.push('Win Chance');
            if (!bet_amount) missingFields.push('Bet Amount');
    
            if (missingFields.length > 0) {
                return res.status(400).json({ error: 'Required fields missing.', missing_fields: missingFields });
            }
    
            const result = await limboService.processBet({ ...req.body, userId });
    
            return res.status(200).json(result);
        } catch (error) {
            console.error('Error in limbo placeBet Controller:', error.message);
            logger.error(`Error fetching limbo placeBet Controller: ${error.message}`, { stack: error.stack });

            return res.status(500).json({ status: 'Error', message: 'Internal server error' });
        }
    }
}

module.exports = new LimboController();