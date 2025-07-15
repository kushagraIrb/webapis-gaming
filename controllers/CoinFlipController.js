const { logger } = require('../logger');
const coinFlipService = require('../services/coinFlipService');
require('dotenv').config();

class CoinFlipController {
    async currentMatchDetails(req, res) {
        try {
            // Step 1: Fetch Current Coin Flip Match
            const currentCoinFlipMatch = await coinFlipService.currentCoinFlipMatch();
    
            if (!currentCoinFlipMatch || currentCoinFlipMatch.length === 0) {
                return res.status(404).send({ msg: 'No current match found' });
            }
    
            // Step 2: Extract 'copyof' value
            const copyof = currentCoinFlipMatch.copyof;
    
            // Step 3: Fetch last 20 final_results for this copyof
            const pastResults = await coinFlipService.getPastResults(copyof);

            // Step 4: Fetch last 20 final_results for this copyof
            const minBetAmount = await coinFlipService.minBetAmount();
    
            // Step 5: Send both current match and past results
            return res.status(200).send({
                currentMatch: currentCoinFlipMatch,
                minBetAmount: minBetAmount,
                pastResults: pastResults
            });
    
        } catch (error) {
            console.error('Error in Fetching Current Coin Flip Match:', error.message);
            logger.error(`Error in Fetching Current Coin Flip Match: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async userPastResults(req, res) {
        try {
            const user_id  = req.user_id;

            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            const userPastResults = await coinFlipService.userPastResults(user_id);
            return res.status(200).send(userPastResults);
        } catch (error) {
            console.error('Error in Fetching Current Coin Flip User past results:', error.message);
            logger.error(`Error in Fetching Current Coin Flip User past results: ${error.message}`, { stack: error.stack });
    
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async userBetHistory(req, res) {
        try {
            const user_id = req.user_id;

            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            const betHistory = await coinFlipService.userBetHistory(user_id);
            return res.status(200).send(betHistory);
        } catch (error) {
            console.error('Error fetching user bet history:', error.message);
            logger.error(`Error fetching user bet history: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async saveCoinBet(req, res) {
        try {
            const user_id = req.user_id;
            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }
    
            const { match_id, prediction, minimum_betamount, bet_amount } = req.body;
    
            // Step 1 & 2: Match status and Betting status
            const [matchStatus, betStatus] = await Promise.all([
                coinFlipService.isMatchOver(user_id, match_id),
                coinFlipService.checkBettingStatus()
            ]);

            if (matchStatus.isMatchOver) {
                return res.status(401).json({
                    message: 'Sorry! This match is already over. Money not deducted. Try again.',
                });
            }
    
            // if (matchStatus.isMatchOver < matchStatus.isWithin60SecAfterBet) {
            //     return res.status(401).json({
            //         message: 'Sorry! This match is already over. Money not deducted. Try again.',
            //     });
            // }
    
            if (betStatus === '0') {
                return res.status(401).json({ message: 'Betting is currently off.' });
            }
    
            if (bet_amount < minimum_betamount) {
                return res.status(401).json({ message: 'Bet amount is less than the minimum bet amount!' });
            }
    
            // Step 3: Wallet & Bonus amount fetch + Bet existence check
            const [walletAmountRaw, bonusAmountRaw, alreadyBetted] = await Promise.all([
                coinFlipService.calculateWalletAmount(user_id),
                coinFlipService.calculateBonus(user_id),
                coinFlipService.checkAlreadyBet(user_id, match_id)
            ]);
    
            const walletAmount = parseFloat(walletAmountRaw);
            const bonusAmount = parseFloat(bonusAmountRaw);
            const totalBalance = walletAmount + bonusAmount;
    
            if (bet_amount > totalBalance) {
                return res.status(401).json({ message: 'Your bet amount is greater than your wallet amount!' });
            }
    
            if (alreadyBetted) {
                return res.status(401).json({ message: 'You have already placed a bet on this match!' });
            }
    
            // Step 4: Calculate deduction split
            let usedFromBonus = 0, usedFromWallet = 0;
            if (bonusAmount >= bet_amount) {
                usedFromBonus = bet_amount;
            } else {
                usedFromBonus = bonusAmount;
                usedFromWallet = bet_amount - bonusAmount;
            }
    
            const updatedBonus = bonusAmount - usedFromBonus;
            const updatedWallet = walletAmount - usedFromWallet;
    
            // Step 5: Save Bet
            const betData = {
                user_id,
                match_id,
                amount: bet_amount,
                bonusAmount,
                walletAmount,
                prediction,
            };
            const bet = await coinFlipService.placeCoinBet(betData);
            const LastBetID = bet.betId;
    
            if (!LastBetID) {
                return res.status(500).json({ error: 'Failed to place bet.' });
            }
    
            const existingBet = await coinFlipService.getBetByIdAndUser(user_id, LastBetID);
            if (!existingBet) {
                return res.status(500).json({ error: 'Bet not found after placement.' });
            }
    
            // Step 6: Check threshold and send email
            const thresholdAmount = await coinFlipService.getThresholdAmount();
            if (thresholdAmount && bet_amount > thresholdAmount) {
                const userData = await coinFlipService.getUserDetails(user_id);
                if (userData) {
                    coinFlipService.sendEmail(userData, bet_amount).catch(console.error);
                }
            }
    
            // Step 7: Insert report
            const reportData = {
                bet_id: LastBetID,
                user_id,
                bet_amount,
                bet_from_bonus: usedFromBonus,
                bet_from_wallet: usedFromWallet,
            };
            await coinFlipService.insertReport(reportData);
    
            // Step 8: Insert transaction history
            const insertTasks = [];
    
            if (usedFromBonus > 0) {
                const bonusHistory = {
                    user_id,
                    bet_id: LastBetID,
                    match_id,
                    debit_bonus: usedFromBonus,
                    total_bonus: updatedBonus,
                    bonus_type: 'Debit',
                    bonus_status: 'Bet',
                };
                insertTasks.push(coinFlipService.insertBonusHistory(bonusHistory));
            }
    
            if (usedFromWallet > 0) {
                const walletHistory = {
                    bet_id: LastBetID,
                    match_id,
                    user_id,
                    debit_amount: usedFromWallet,
                    total_amount: updatedWallet,
                    type: 'Debit',
                    t_status: 'Bet',
                };
                insertTasks.push(coinFlipService.insertTransactionHistory(walletHistory));
            }
    
            await Promise.all(insertTasks);
    
            // Final Response
            return res.status(200).json({
                status: true,
                message: 'Coin Flip bet placed successfully!'
            });
    
        } catch (error) {
            console.error(error);
            logger.error(`Error in saving coin flip: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ error: 'Internal server error!' });
        }
    }

    // Give winning to the users who all won
    async createWinner(req, res) { 
        try {
            // 🔒 Token check
            const token = req.query.token || req.headers['x-auth-token'];

            if (token !== process.env.COINFLIP_SECRET_KEY) {
                return res.status(403).json({ message: 'Unauthorized request' });
            }

            const matchResult = await coinFlipService.getEligibleMatch();
        
            if (!matchResult) {
                return res.status(200).send({ message: 'No eligible match to process.' });
            }
        
            await coinFlipService.giveWinnings(matchResult.match, matchResult.result);
        
            return res.status(200).send('Match result processed and winnings distributed.');
        
        } catch (error) {
            console.error('Error in createWinner:', error.message);
            logger.error(`Error in create winner API: ${error.message}`, { stack: error.stack });
            return res.status(500).send({ msg: 'Error occurred', error: error.message });
        }
    }
}

module.exports = new CoinFlipController();