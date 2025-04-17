const { logger } = require('../logger');
const coinFlipService = require('../services/coinFlipService');

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
    
            if (matchStatus.isMatchOver < matchStatus.isWithin60SecAfterBet) {
                return res.status(401).json({
                    message: 'Sorry! This match is already over. Money not deducted. Try again.',
                });
            }
    
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

    // async saveCoinBet(req, res) {
    //     try {
    //         const user_id  = req.user_id;

    //         if (!user_id) {
    //             return res.status(401).json({ msg: 'Invalid user.' });
    //         }

    //         const { match_id, prediction, minimum_betamount, bet_amount } = req.body;

    //         // Step 1: Check if the match is already over
    //         const matchStatus = await coinFlipService.isMatchOver(user_id, match_id);
    //         if (matchStatus.isMatchOver < matchStatus.isWithin60SecAfterBet) {
    //             return res.status(401).json({
    //                 message: 'Sorry! This match is already over. Money not deducted. Try again.',
    //             });
    //         }

    //         // Step 2: Check if betting is enabled
    //         const betStatus = await coinFlipService.checkBettingStatus();
    //         if (betStatus === '0') {
    //             return res.status(401).json({
    //                 message: 'Betting is currently off.',
    //             });
    //         }

    //         // Step 3: Check minimum bet amount
    //         if (bet_amount < minimum_betamount) {
    //             return res.status(401).json({
    //                 message: 'Bet amount is less than the minimum bet amount!',
    //             });
    //         }
      
    //         // Step 4: Validate user balance (wallet + bonus)
    //         const walletAmount = parseFloat(await coinFlipService.calculateWalletAmount(user_id));
    //         const bonusAmount = parseFloat(await coinFlipService.calculateBonus(user_id));
      
    //         const totalBalance = walletAmount + bonusAmount;
      
    //         if (bet_amount > totalBalance) {
    //             return res.status(401).json({
    //                 message: 'Your bet amount is greater than your wallet amount!',
    //             });
    //         }

    //         // Step 5: Check if the user has already placed a bet on this match
    //         const alreadyBetted = await coinFlipService.checkAlreadyBet(user_id, match_id);
    //         if (alreadyBetted) {
    //             return res.status(401).json({
    //                 message: 'You have already placed a bet on this match!',
    //             });
    //         }
      
    //         // Step 6: Deduct wallet and bonus balance
    //         let sesBonus = 0, UsedBonus = 0, sesusedWAmont = 0, welltAmont = 0;

    //         if (bonusAmount > 0) {
    //             if (bonusAmount >= bet_amount) {
    //                 sesBonus = (bonusAmount - bet_amount);
    //                 UsedBonus = bet_amount;
    //                 sesusedWAmont = 0;
    //             } else {
    //                 sesBonus = bonusAmount;
    //                 UsedBonus = bonusAmount;
    //                 sesusedWAmont = (bet_amount - bonusAmount);
    //                 welltAmont = (walletAmount - sesusedWAmont);
    //             }
    //         } else {
    //             sesBonus = 0;
    //             UsedBonus = 0;
    //             sesusedWAmont = bet_amount;
    //             welltAmont = (walletAmount - bet_amount);
    //         }

    //         // Step 7: Save the bet
    //         const betData = {
    //             user_id,
    //             match_id,
    //             amount,
    //             bonusAmount,
    //             walletAmount,
    //             prediction,
    //         };
    //         const bet = await coinFlipService.placeCoinBet(betData);
    //         const LastBetID = bet.betId;

    //         // Step 8: Check if the bet was successfully placed
    //         const existingBet = await coinFlipService.getBetByIdAndUser(user_id, LastBetID);

    //         if (existingBet && LastBetID) {
    //             // Step 9: Check if thresholdAmount is greater then bet amount. If yes then send the mail.
    //             const thresholdAmount = await coinFlipService.getThresholdAmount();

    //             if (thresholdAmount && bet_amount > thresholdAmount) {
    //                 const userData = await coinFlipService.getUserDetails(user_id);
    //                 if (userData) {
    //                     await coinFlipService.sendEmail(userData, bet_amount);
    //                 }
    //             }

    //             // Step 10: Insert data into the report table
    //             const reportData = {
    //                 bet_id: LastBetID,
    //                 user_id,
    //                 bet_amount,
    //                 bet_from_bonus: UsedBonus,
    //                 bet_from_wallet: sesusedWAmont,
    //             };
    //             await coinFlipService.insertReport(reportData);

    //             // Step 11: Handle bonus and wallet transactions
    //             if (bonusAmount > 0) {
    //                 if (bonusAmount >= bet_amount) {
    //                     const sesBonus = bonusAmount - bet_amount;
    //                     const bonusHistory = {
    //                         user_id,
    //                         bet_id: LastBetID,
    //                         match_id,
    //                         debit_bonus: bet_amount,
    //                         total_bonus: sesBonus,
    //                         bonus_type: 'Debit',
    //                         bonus_status: 'Bet',
    //                     };
    //                     await coinFlipService.insertBonusHistory(bonusHistory);
    //                 } else {
    //                     const sesBonus = bonusAmount;
    //                     const sesusedWAmont = bet_amount - bonusAmount;
    //                     const welltAmont = walletAmount - sesusedWAmont;

    //                     const bonusHistory1 = {
    //                         user_id,
    //                         bet_id: LastBetID,
    //                         match_id,
    //                         debit_bonus: sesBonus,
    //                         total_bonus: 0,
    //                         bonus_type: 'Debit',
    //                         bonus_status: 'Bet',
    //                         fromElse: true
    //                     };
    //                     await coinFlipService.insertBonusHistory(bonusHistory1);

    //                     const walletHistory1 = {
    //                         bet_id: LastBetID,
    //                         match_id,
    //                         user_id,
    //                         debit_amount: sesusedWAmont,
    //                         total_amount: welltAmont,
    //                         type: 'Debit',
    //                         t_status: 'Bet',
    //                     };
    //                     await coinFlipService.insertTransactionHistory(walletHistory1);
    //                 }
    //             } else {
    //                 const walletAmount = parseFloat(await coinFlipService.calculateWalletAmount(user_id));
    //                 const welltAmont = walletAmount - bet_amount;

    //                 const walletHistory = {
    //                     bet_id: LastBetID,
    //                     match_id,
    //                     user_id,
    //                     debit_amount: bet_amount,
    //                     total_amount: welltAmont,
    //                     type: 'Debit',
    //                     t_status: 'Bet',
    //                 };
    //                 await coinFlipService.insertTransactionHistory(walletHistory);
    //             }
    //         }

    //         // Step 12: Return success response
    //         return res.status(200).json({
    //             status: true,
    //             message: 'Coin Flip bet placed successfully!'
    //         });
    //     } catch (error) {
    //         console.error(error);
    //         logger.error(`Error in saving coin flip: ${error.message}`, { stack: error.stack });
            
    //         res.status(500).json({ error: 'Internal server error!' });
    //     }
    // }

    // Give winning to the users who all won
    async createWinner(req, res) { 
        try {
          const matchResult = await coinFlipService.getEligibleMatch();
      
          if (!matchResult) {
            return res.status(200).send({ message: 'No eligible match to process.' });
          }
      
          await coinFlipService.giveWinnings(matchResult.match, matchResult.result);
      
          return res.status(200).send('Match result processed and winnings distributed.');
      
        } catch (error) {
          console.error('Error in createWinner:', error.message);
          return res.status(500).send({ msg: 'Error occurred', error: error.message });
        }
    }
}

module.exports = new CoinFlipController();