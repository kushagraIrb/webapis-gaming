const limboModel = require('../models/limboModel');

class LimboService {
    static async getUserBySessionToken(token) {
        try {
            return await limboModel.getUserByToken(token);
        } catch (error) {
            throw new Error('Failed to retrieve user');
        }
    }
    
    static async getUserBets(userId) {
        try {
            return await limboModel.getUserBets(userId);
        } catch (error) {
            throw new Error('Failed to fetch user bets');
        }
    }

    static async processBet(data) {
        const {
            userId,
            bet_type,
            target_multiplier,
            win_chance,
            bet_amount,
            profit_on_win,
            number_of_bets,
            on_wins,
            on_loss,
            stop_on_profit,
            stop_on_loss
        } = data;

        const walletBalance = await limboModel.getWalletBalance(userId);
        if (walletBalance <= 0) {
            return { status: 'Stop', message: 'Not enough wallet balance left to place a bet.' };
        }

        const limboPayload = {
            bet_type,
            target_multiplier,
            win_chance,
            bet_amount,
            profit_on_win: bet_type == 1 ? profit_on_win : null,
            number_of_bets: bet_type == 2 ? number_of_bets : null,
            on_wins: bet_type == 2 ? on_wins : 0.00,
            on_loss: bet_type == 2 ? on_loss : 0.00,
            stop_on_profit: bet_type == 2 ? stop_on_profit : 0.00,
            stop_on_loss: bet_type == 2 ? stop_on_loss : 0.00,
            user_id: userId
        };

        const limboId = await limboModel.insertLimbo(limboPayload);

        if (!limboId) {
            return { status: 'Error', message: 'Unable to insert in the tbl_limbo.' };
        }

        const availableBalance = await limboModel.getLatestWalletBalance(userId);
        const balanceAfterBet = parseFloat(availableBalance) - parseFloat(bet_amount);

        await limboModel.insertTransaction({
            d_w_id: 0,
            limbo_id: limboId,
            match_id: 0,
            withdrawal_id: 0,
            win_id: NULL,
            user_id: userId,
            coin_match_id: NULL,
            debit_amount: bet_amount,
            total_amount: balanceAfterBet,
            type: 'Debit',
            t_status: 'Bet'
        });

        const betMultiplier = await this.betMultiplier(userId);

        if (betMultiplier > target_multiplier) {
            const payout = bet_amount * target_multiplier;
            await limboModel.updateLimbo({
                id: limboId,
                payout,
                bet_multiplier: betMultiplier
            });

            const updatedBalance = await limboModel.getLatestWalletBalance(userId);
            const balanceAfterWin = parseFloat(updatedBalance) + parseFloat(payout);

            await limboModel.insertTransaction({
                d_w_id: 0,
                limbo_id: limboId,
                match_id: 0,
                withdrawal_id: 0,
                win_id: 0,
                user_id: userId,
                coin_match_id: 0,
                credit_amount: payout,
                total_amount: balanceAfterWin,
                type: 'Credit',
                t_status: 'Deposit',
            });

            return {
                status: 'Win',
                data: 'Bet placed successfully',
                bet_multiplier: betMultiplier
            };
        } else {
            await limboModel.updateLimbo({
                id: limboId,
                payout: 0.00,
                bet_multiplier: betMultiplier
            });

            return {
                status: 'Loss',
                data: 'Bet placed successfully',
                bet_multiplier: betMultiplier
            };
        }
    }

    static async betMultiplier(userId) {
        let excludedIds = [];

        const set = await limboModel.getRandomSet(excludedIds);
        if (!set) return null;

        const validSet = await this.validateSetUsage(set, userId, excludedIds);
        if (!validSet) return null;

        const multiplier = await this.getRandomMultiplier(validSet.game_set);
        return multiplier;
    }

    static async validateSetUsage(set, userId, excludedIds = []) {
        const setId = set.id;
        const usageCount = await limboModel.getUsageCount(userId, setId);

        if (usageCount >= set.count) {
            excludedIds.push(setId);
            const newSet = await limboModel.getRandomSet(excludedIds);

            if (newSet) {
                return await this.validateSetUsage(newSet, userId, excludedIds);
            } else {
                await limboModel.resetUsage(userId);
                const freshSet = await limboModel.getRandomSet();
                if (freshSet) {
                    return await this.validateSetUsage(freshSet, userId, []);
                }
            }
        }

        const updated = await limboModel.updateUsage(userId, setId);
        if (updated) {
            return set;
        }

        const inserted = await limboModel.insertUsage(userId, setId);
        if (inserted) {
            return set;
        }

        return null;
    }

    static async getRandomMultiplier(gameSet) {
        const [min, max] = gameSet.split('-').map(parseFloat);
        const random = Math.floor(Math.random() * ((max * 100) - (min * 100) + 1) + (min * 100)) / 100;
        return random;
    }
}

module.exports = LimboService;