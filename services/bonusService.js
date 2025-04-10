const bonusModel = require('../models/bonusModel');
const liveBetService = require('../services/liveBetService');

class BonusService {
    // Fetch bet list or count
    static async fetchBonusListing(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            
            // Fetch total count
            const totalCount = await bonusModel.getBonusCount(userId);

            // Fetch paginated bet list
            const bonusList = await bonusModel.getBonusList(userId, start, perPage);

            return { total_count: totalCount.total_count, bonusList };
        } catch (error) {
            console.error('Error in BonusService:', error.message);
            throw new Error('Failed to fetch bonus list');
        }
    }

    // Fetch bet stats or count
    static async getBonusStats(userId) { 
        try {
            const [bonusLeague, currentProgress] = await Promise.all([
                bonusModel.getBonusLeague(userId),
                bonusModel.getCurrentProgress(userId)
            ]);
    
            const totalDeposit = currentProgress?.totalDeposit || 0;
            const totalBet = parseInt(currentProgress?.totalBet) || 0;
    
            const remainingProgressData = await bonusModel.getRemainingProgress(userId, totalDeposit, totalBet);
    
            const deposit_amount = remainingProgressData?.deposit_amount || 0;
            const bet_amount = remainingProgressData?.bet_amount || 0;
    
            // Cap totalDeposit and totalBet only for percentage calculation
            const cappedDeposit = totalDeposit > deposit_amount ? deposit_amount : totalDeposit;
            const cappedBet = totalBet > bet_amount ? bet_amount : totalBet;
    
            // Extract only `remainingDeposit` and `remainingBet`
            const remainingProgress = {
                remainingDeposit: remainingProgressData?.remainingDeposit || 0,
                remainingBet: remainingProgressData?.remainingBet || 0
            };
    
            const progressPercent = (deposit_amount + bet_amount) > 0
                ? parseFloat(((cappedDeposit + cappedBet) / (deposit_amount + bet_amount) * 100).toFixed(2))
                : 0;
    
            const MaxClaimBonus = await bonusModel.fetchAvailableBonus(userId);
    
            return { 
                bonusLeague,
                currentProgress,
                remainingProgress,
                progressPercent,
                MaxClaimBonus,
            };
        } catch (error) {
            console.error('Error in BonusService:', error.message);
            throw new Error('Failed to fetch bonus list');
        }
    }    
    
    static async claimBonus(userId, bonusAmount) {
        try {
            // Fetch last available bonus
            const lastTotalBonus = await bonusModel.fetchAvailableBonus(userId);
            if (lastTotalBonus < bonusAmount) {
                return { success: false, status: 400, message: 'Insufficient bonus balance.' };
            }
    
            // Fetch wallet balance
            const walletAmount = parseFloat(await liveBetService.calculateWalletAmount(userId));
            if (walletAmount === null) {
                return { success: false, status: 500, message: 'Failed to retrieve wallet balance.' };
            }
    
            // Insert bonus transaction
            const bonusInserted = await bonusModel.insertBonusTransaction(userId, bonusAmount, walletAmount);
            if (!bonusInserted) {
                return { success: false, status: 500, message: 'Bonus transaction insertion failed.' };
            }
    
            // Deduct bonus amount
            const bonusWithdrawn = await bonusModel.updateBonusBalance(userId, bonusAmount, lastTotalBonus);
            if (!bonusWithdrawn) {
                return { success: false, status: 500, message: 'Bonus withdrawal failed.' };
            }
    
            return { success: true };
        } catch (error) {
            console.error('Error in claimBonus:', error.message);
            return { success: false, status: 500, message: 'An error occurred during the bonus claim process.' };
        }
    }    
}

module.exports = BonusService;