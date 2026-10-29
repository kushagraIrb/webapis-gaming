const { logger } = require('../logger');
const coinFlipService = require('../services/coinFlipService');
const liveBetService = require('../services/liveBetService');
const fs = require('fs');
const moment = require('moment-timezone');
require('dotenv').config();

class CoinFlipController {
    async eligibility(req, res) {
        try {
            const user_id = req.user_id;
            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            return res.status(200).json(await coinFlipService.getEligibility(user_id));
        } catch (error) {
            console.error('Error checking Coin Flip eligibility:', error.message);
            logger.error(`Error checking Coin Flip eligibility: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ message: 'Unable to check Coin Flip eligibility.' });
        }
    }

    async currentMatchDetails(req, res) {liveBetService
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
            logger.error(`Error fetching coin flip user bet history: ${error.message}`, { stack: error.stack });

            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async saveCoinBet(req, res) {
        try {
            const user_id = req.user_id;
            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            // This is enforced on the server so a direct API call cannot bypass the disabled UI.
            const eligibility = await coinFlipService.getEligibility(user_id);
            if (!eligibility.eligible) {
                return res.status(403).json({
                    message: 'Coin Flip is available after your account is 7 days old and you have made valid approved deposits totalling Rs. 5,000.',
                    eligibility,
                });
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

            // Step 3: Check if the betting is allowed by the admin or not (At the time of withdrawing the money user has access to toggle the betting rights of the user)
            const bettingRestricted = await liveBetService.isUserRestrictedFromBetting(user_id);
            if (bettingRestricted > 0) {
                // ❌ At least one row has is_bet_allowed = 1
                return res.status(401).json({
                    message: 'Withdrawal request is in progress. Please wait.',
                });
            }
    
            // Step 4: Wallet & Bonus amount fetch + Bet existence check
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
    
            // Step 5: Calculate deduction split
            let usedFromBonus = 0, usedFromWallet = 0;
            if (bonusAmount >= bet_amount) {
                usedFromBonus = bet_amount;
            } else {
                usedFromBonus = bonusAmount;
                usedFromWallet = bet_amount - bonusAmount;
            }
    
            const updatedBonus = bonusAmount - usedFromBonus;
            const updatedWallet = walletAmount - usedFromWallet;
    
            // Step 6: Save Bet
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
    
            // Step 7: Check threshold and send email
            const thresholdAmount = await coinFlipService.getThresholdAmount();
            if (thresholdAmount && bet_amount > thresholdAmount) {
                const userData = await coinFlipService.getUserDetails(user_id);
                if (userData) 
                {
                    // YEH LINE ADD KAREIN
                    console.log(`Email bhejne ki koshish kar raha hoon... Bet Amount: ${bet_amount}, Threshold: ${thresholdAmount}`);
                    coinFlipService.sendEmail(userData, bet_amount).catch(console.error);
                }
            }
    
            // Step 8: Insert report
            const reportData = {
                bet_id: LastBetID,
                user_id,
                bet_amount,
                bet_from_bonus: usedFromBonus,
                bet_from_wallet: usedFromWallet,
            };
            await coinFlipService.insertReport(reportData);
    
            // Step 9: Insert transaction history
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

    async createWinner(req, res) { 
        
        // console.log("🚀 API HIT (IST):", moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"));

        try {
            const token = req.query.token || req.headers['x-auth-token'];

            if (token !== process.env.COINFLIP_SECRET_KEY) {
                return res.status(403).json({ message: 'Unauthorized request' });
            }

            // Settle the finished match and pay its winners, then create the next match --
            // all in one call, under one lock (see CoinFlipService.settleEligibleMatch).
            // Nothing is checked here first: whether a match is due, and whether the next
            // one may be created, is decided by the clock inside the service, so this call
            // can never return early and leave the game without a new match (no current
            // match, a bad match time), and a match that fails to settle does not stop the
            // next one from being created.
            const matchResult = await coinFlipService.settleEligibleMatch({ thenCreateNext: true });

            if (!matchResult) {
                console.log("⚠️ No match was due (or another request is already settling)");
            }

            return res.status(200).send('Match processed');

        } catch (error) {
            console.error('Error in createWinner:', error.message);

            return res.status(500).send({ msg: 'Error occurred', error: error.message });
        }
    }

    async coinFlipHistory(req, res) {
        try {
            const user_id = req.user_id;

            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            // Get pagination parameters from the query (if available)
            const { page = 1, perPage = 10 } = req.query; // Default: page 1, 10 items per page
    
            // Fetch blogs using the service
            const { coinFlipHistory, totalCount } = await coinFlipService.coinFlipList(Number(page), Number(perPage), user_id);
    
            return res.status(200).send({
                status: true,
                data: coinFlipHistory,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
            });
        } catch (error) {
            console.error('Error fetching coin flip history:', error.message);
            logger.error(`Error fetching coin flip history: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                msg: 'An error occurred',
                error: error.message,
            });
        }
    }
    
    //function to get current server time
    async getServerTime(req, res) {
        try {
          // Require inside the function
          const moment = require('moment-timezone');
    
          const serverTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    
          res.json({
            success: true,
            timezone: 'Asia/Kolkata',
            serverTime
          });
        } catch (error) {
          console.error('Error fetching server time:', error);
          logger.error(`Error fetching coin flip server time: ${error.message}`, { stack: error.stack });
          res.status(500).json({
            success: false,
            message: 'Error fetching server time'
          });
        }
    }
}

module.exports = new CoinFlipController();
