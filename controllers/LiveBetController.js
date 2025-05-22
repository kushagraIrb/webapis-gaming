const { logger } = require('../logger');
const liveBetService = require('../services/liveBetService');

class LiveBetController {
    async homeListing(req, res) {
        try {
            // Fetch live and past matches
            const liveMatches = await liveBetService.homeListingMatches();

            return res.status(200).send(liveMatches);
        } catch (error) {
            console.error('Error in liveBet:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async liveBet(req, res) {
        try {
            const userId  = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            // Fetch user pincode
            const userPincode = await liveBetService.getUserPincode(userId);

            // Fetch live and past matches
            const liveMatches = await liveBetService.getLiveMatches(userId);
            // const pastMatches = await liveBetService.getPastMatches();

            return res.status(200).send({
                liveMatches,
                // pastMatches,
                userPincode,
            });
        } catch (error) {
            console.error('Error in liveBet:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    async getMatchDetails(req, res) {
        try {
            const encryptedMatchId = req.params.encrypted_id;
            const userId  = req.user_id;

            if (!userId) {
                return res.status(401).json({ msg: 'Unauthorized. Please log in.' });
            }

            const matchDetails = await liveBetService.getMatchDetails(encryptedMatchId);
            const tossTypes = await liveBetService.getTossTypes();
            const minBetAmount = await liveBetService.getMinBetAmount();
            const userBets = await liveBetService.getUserBets(userId, encryptedMatchId);
            
            return res.status(200).json({
                matchDetails,
                tossTypes,
                minBetAmount,
                userBets,
            });
        } catch (error) {
            console.error('Error fetching match details:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ msg: 'An error occurred', error: error.message });
        }
    }

    async saveBet(req, res) {
        try {
            // Step 1: Check if betting is enabled
            const betStatus = await liveBetService.checkBettingStatus();
            if (betStatus === '0') {
                return res.status(401).json({
                    message: 'Betting is currently off. You will be able to place a bet after 1 minute.',
                });
            }

            const user_id  = req.user_id;

            if (!user_id) {
                return res.status(401).json({ msg: 'Invalid user.' });
            }

            const { match_id, minimum_betamount, team_value, toss_id, bet_amount } = req.body;

            // Step 2: Check if the winner has already been announced
            const winnerAnnounced = await liveBetService.checkWinnerAnnounced(match_id);
            if (winnerAnnounced) {
                return res.status(401).json({
                    message: 'The winner of the match has already been announced. Please try betting on another match!',
                });
            }

             // Step 3: Check if the betting is allowed by the admin or not (At the time of withdrawing the money user has access to toggle the betting rights of the user)
            const bettingRestricted = await liveBetService.isUserRestrictedFromBetting(user_id);
            if (bettingRestricted > 0) {
                // ❌ At least one row has is_bet_allowed = 1
                return res.status(403).json({
                    message: 'Your withdrawal is in progress so betting is currently restricted. Please try again after some time!',
                });
            }
      
            // Step 4: Validate user balance (wallet + bonus)
            const walletAmount = parseFloat(await liveBetService.calculateWalletAmount(user_id));
            const bonusAmount = parseFloat(await liveBetService.calculateBonus(user_id));
      
            const totalBalance = walletAmount + bonusAmount;
      
            if (bet_amount > totalBalance) {
                return res.status(401).json({
                    message: 'Your bet amount is greater than your wallet amount!',
                });
            }

            // Step 4: Check minimum bet amount
            if (bet_amount < minimum_betamount) {
                return res.status(401).json({
                    message: 'Bet amount is less than the minimum bet amount!',
                });
            }
      
            // Step 5: Check if the match is cancelled
            const isCancelled = await liveBetService.isMatchCancelled(match_id);
            if (!isCancelled) {
                return res.status(401).json({
                    message: 'This match has been cancelled!',
                });
            }

            // Step 6: Check if the user has already placed a bet on this match
            const alreadyBetted = await liveBetService.checkAlreadyBet(user_id, match_id);
            if (alreadyBetted) {
                return res.status(401).json({
                    message: 'You have already placed a bet on this match!',
                });
            }

            // Step 7: Check if the match is already over
            const matchStatus = await liveBetService.isMatchOver(match_id);
            if (matchStatus.isMatchOver) {
                return res.status(401).json({
                    message: 'Sorry! The match is already over.',
                });
            }
      
            // Step 8: Deduct wallet and bonus balance (Implement the logic based on your provided code)
            let sesBonus = 0, UsedBonus = 0, sesusedWAmont = 0, welltAmont = 0;

            if (bonusAmount > 0) {
                if (bonusAmount >= bet_amount) {
                    sesBonus = (bonusAmount - bet_amount);
                    UsedBonus = bet_amount;
                    sesusedWAmont = 0;
                } else {
                    sesBonus = bonusAmount;
                    UsedBonus = bonusAmount;
                    sesusedWAmont = (bet_amount - bonusAmount);
                    welltAmont = (walletAmount - sesusedWAmont);
                }
            } else {
                sesBonus = 0;
                UsedBonus = 0;
                sesusedWAmont = bet_amount;
                welltAmont = (walletAmount - bet_amount);
            }

            // Step 9: Save the bet
            const betData = {
                user_id,
                match_id,
                team_id: team_value,
                toss_id,
                amount: bet_amount,
                bonus_amount: UsedBonus,
                wallet_amount: sesusedWAmont,
            };
            const bet = await liveBetService.placeBet(betData);
            const LastBetID = bet.betId;

            // Step 9: Check if the bet was successfully placed
            const existingBet = await liveBetService.getBetByIdAndUser(user_id, LastBetID);

            if (existingBet && LastBetID) {
                // Step 10: Insert data into the report table
                const reportData = {
                    bet_id: LastBetID,
                    user_id,
                    match_id,
                    team_id: team_value,
                    bet_amount,
                    bet_from_bonus: UsedBonus,
                    bet_from_wallet: sesusedWAmont,
                };
                await liveBetService.insertReport(reportData);

                // Step 11: Handle bonus and wallet transactions
                if (bonusAmount > 0) {
                    if (bonusAmount >= bet_amount) {
                        const sesBonus = bonusAmount - bet_amount;
                        const bonusHistory = {
                            user_id,
                            bet_id: LastBetID,
                            match_id,
                            debit_bonus: bet_amount,
                            total_bonus: sesBonus,
                            bonus_type: 'Debit',
                            bonus_status: 'Bet',
                        };
                        await liveBetService.insertBonusHistory(bonusHistory);
                    } else {
                        const sesBonus = bonusAmount;
                        const sesusedWAmont = bet_amount - bonusAmount;
                        const welltAmont = walletAmount - sesusedWAmont;

                        const bonusHistory1 = {
                            user_id,
                            bet_id: LastBetID,
                            match_id,
                            debit_bonus: sesBonus,
                            total_bonus: 0,
                            bonus_type: 'Debit',
                            bonus_status: 'Bet',
                        };
                        await liveBetService.insertBonusHistory(bonusHistory1);

                        const walletHistory1 = {
                            bet_id: LastBetID,
                            match_id,
                            user_id,
                            debit_amount: sesusedWAmont,
                            total_amount: welltAmont,
                            type: 'Debit',
                            t_status: 'Bet',
                        };
                        await liveBetService.insertTransactionHistory(walletHistory1);
                    }
                } else {
                    const walletAmount = parseFloat(await liveBetService.calculateWalletAmount(user_id));
                    const welltAmont = walletAmount - bet_amount;

                    const walletHistory = {
                        bet_id: LastBetID,
                        match_id,
                        user_id,
                        debit_amount: bet_amount,
                        total_amount: welltAmont,
                        type: 'Debit',
                        t_status: 'Bet',
                    };
                    await liveBetService.insertTransactionHistory(walletHistory);
                }
            }

            // Step 12: Return success response
            return res.status(200).json({
                status: true,
                message: 'Bet placed successfully!',
                bet,
            });
        } catch (error) {
            console.error(error);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            res.status(500).json({ error: 'Internal server error!' });
        }
    }

    async cancelBet(req, res) {
        try {
            const userId  = req.user_id;

            if (!userId) {
                return res.status(401).json({ msg: 'Unauthorized. Please log in.' });
            }

            const { bet_id, match_id } = req.body;

            if (!bet_id || !match_id) {
                return res.status(400).send({ msg: 'Bet Id & Match Id are required!' });
            }
    
            // Step 1: Check if match is already over
            const matchStatus = await liveBetService.isMatchOver(match_id);
            if (matchStatus.isFirstMatchTimePassed) {
                return res.status(401).json({
                    message: 'Time is up for canceling the match.',
                });
            }
            if (matchStatus.isMatchOver) {
                return res.status(401).json({
                    message: 'Sorry! The match is already over.',
                });
            }
    
            // Step 2: Check if the winner is already announced
            const isWinnerAnnounced = await liveBetService.checkWinnerAnnounced(match_id);
            if (isWinnerAnnounced) {  // Since service.js returns true if a winner is announced
                return res.status(401).json({
                    message: 'Winner of the match is already announced.',
                });
            }

            // Step 3: Check if match is already cancel
            const isMatchCancelled = await liveBetService.isMatchCancelled(match_id);
            if (!isMatchCancelled) {
                return res.status(401).json({
                    message: 'This match has been cancelled!',
                });
            }
            
            // Step 4: Check if bet is already cancelled
            const isBetCancelled = await liveBetService.isBetCancelled(userId, bet_id);
            if (isBetCancelled) {
                return res.status(401).json({
                    message: 'This bet has already been cancelled!',
                });
            }
            
            // Step 5: Fetch Wallet and bet amount
            const walletAmount = parseFloat(await liveBetService.calculateWalletAmount(userId)) || 0;
            const betAmount = parseFloat(await liveBetService.getBetAmount(bet_id));
            let totalWalletAmount = walletAmount + betAmount;

            // Step 6: Cancel Charge after 5 Times Cancellation
            const countCancelBet = await liveBetService.getNumberOfCancelBet(userId, match_id);
            let chargesAmt = parseFloat(await liveBetService.CalculateBetCancelCharge(betAmount)) || 0;

            let creditWLAmount;
            if (countCancelBet > 5) {
                creditWLAmount = betAmount - chargesAmt;
            } else {
                creditWLAmount = betAmount;
                chargesAmt = 0;
            }

            // Final Wallet Calculation
            totalWalletAmount = walletAmount + creditWLAmount;

            // Step 7: Wallet Refund
            const refundData = {
                bet_id: bet_id,
                match_id: match_id,
                user_id: userId,
                credit_amount: betAmount,
                total_amount: totalWalletAmount,
                cancel_charge: 0, // If there is a cancellation charge, apply it here
                type: 'Credit',
                t_status: 'Cancel'
            };
            
            // Insert refund transaction into database
            const walletRefund = await liveBetService.refundWallet(refundData);
            
            if (!walletRefund) {
                return res.status(500).json({ message: 'Failed to refund wallet amount' });
            }

            // Step 8: Cancel the Bet After Refund
            const cancelBetStatus = await liveBetService.cancelBet(bet_id);

            if (!cancelBetStatus) {
                return res.status(500).json({ message: 'Failed to cancel bet!' });
            }

            // Step 9: Return the status
            return res.status(200).json({
                status: true,
                message: 'Bet cancelled successfully!',
            });
        } catch (error) {
            console.error(error);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            res.status(500).json({ error: 'Internal server error!' });
        }
    }    

    async extraTimeList(req, res) {
        try {
            const userId  = req.user_id;

            if (!userId) {
                return res.status(401).json({ msg: 'Unauthorized. Please log in.' });
            }

            const result = await liveBetService.getExtraTimeList();

            // return res.status(200).json(result);
            return res.status(200).send(result);
        } catch (error) {
            console.error('Error fetching match details:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ msg: 'An error occurred', error: error.message });
        }
    }
}

module.exports = new LiveBetController();