const coinFlipModel = require('../models/coinFlipModel');
const userModel = require('../models/userModel');
const sendMail = require('../helpers/sendMail');
const { logger } = require('../logger');
const moment = require('moment-timezone'); // ✅ SAHI JAGAH: moment ko file ke top par require kiya
require("dotenv").config();
const { RECEIVER_EMAIL } = process.env;

class CoinFlipService {
  static async currentCoinFlipMatch() {
    try {
      return await coinFlipModel.fetchCurrentMatch();
    } catch (error) {
      throw new Error('Failed to fetch current coin flip match or bet amount.');
    }
  }

  static async minBetAmount() {
    try {
      return await coinFlipModel.fetchMinBetAmount();
    } catch (error) {
      throw new Error('Failed to get past results.');
    }
  }

  static async getPastResults(copyof) {
    try {
      const results = await coinFlipModel.fetchPastResults(copyof);
      return results.map(row => ({
        final_result: row.final_result,
        created: row.created
      }));
    } catch (error) {
      throw new Error('Failed to get past results.');
    }
  }

  static async userPastResults(user_id) {
    try {
      const results = await coinFlipModel.fetchUserPastResults(user_id);

      // Convert win_amount to 'Win' or 'Loss'
      const formattedResults = results.map((item) => ({
        bet_amount: item.bet_amount,
        result: item.win_amount > 0 ? 'Win' : 'Loss',
        inserted_date: item.inserted_date
      }));

      return formattedResults;
    } catch (error) {
      throw new Error('Failed to get past results.');
    }
  }

  static async userBetHistory(user_id) {
    try {
      const history = await coinFlipModel.fetchUserBetHistory(user_id);

      return history.map(item => {
        const isPending = !item.final_result || item.final_result.trim() === '';

        const final_result = isPending ? 'Pending' : item.final_result;
        const result = isPending
          ? 'Pending'
          : item.prediction === item.final_result
            ? 'Win'
            : 'Loss';

        return {
          amount: item.amount,
          prediction: item.prediction,
          final_result,
          result
        };
      });
    } catch (error) {
      throw new Error('Failed to get bet history.');
    }
  }

  static async checkBettingStatus() {
    try {
      return await coinFlipModel.getBettingStatus();
    } catch (error) {
      console.error('Error fetching betting status:', error.message);
      throw new Error('Failed to fetch betting status');
    }
  }

  static async calculateWalletAmount(userId, connection) {
    try {
      // Step 1: Get the maximum transaction ID for the user
      const maxTransId = await coinFlipModel.getMaxTransactionId(userId, connection);
      if (!maxTransId) {
        return 0; // No transactions found
      }

      // Step 2: Get the wallet amount for the maximum transaction ID
      const walletAmount = await coinFlipModel.getWalletAmountByTransactionId(maxTransId, connection);
      return walletAmount;
    } catch (error) {
      throw new Error('Error calculating wallet amount');
    }
  }

  static async calculateBonus(userId, connection) {
    try {
      // Step 1: Get the maximum bonus ID for the user
      const maxBonusId = await coinFlipModel.getMaxBonusId(userId, connection);
      if (!maxBonusId) {
        return 0; // No bonuses found
      }

      // Step 2: Get the bonus amount for the maximum bonus ID
      const bonusAmount = await coinFlipModel.getBonusAmountByBonusId(maxBonusId, connection);
      return bonusAmount;
    } catch (error) {
      throw new Error('Error fetching bonus amount');
    }
  }

  static async getBetAmount(betId) {
    try {
      const betAmount = await coinFlipModel.fetchBetAmount(betId);
      return betAmount;
    } catch (error) {
      console.error("Error fetching bet amount in service:", error);
      throw new Error('Error fetching bet amount');
    }
  }

  static async getNumberOfCancelBet(userId, matchId) {
    try {
      return await coinFlipModel.fetchNumberOfCancelBet(userId, matchId);
    } catch (error) {
      throw new Error('Error fetching cancelled bets count');
    }
  }

  static async checkAlreadyBet(userId, matchId) {
    try {
      return await coinFlipModel.checkAlreadyBet(userId, matchId);
    } catch (error) {
      console.error('Error checking existing bet:', error.message);
      throw new Error('Error checking existing bet');
    }
  }

  // static async isMatchOver(userId, matchId) {
  //   try {
  //     const matchDetails = await coinFlipModel.getMatchTime(userId, matchId);

  //     if (!matchDetails || matchDetails.length === 0) {
  //       throw new Error('Match not found');
  //     }

  //     const { bet_date, match_date, match_time } = matchDetails[0];

  //     const moment = require('moment-timezone');
  //     const now = moment().tz('Asia/Kolkata');

  //     // Convert bet_date and add 60 seconds
  //     const betDatePlus60Sec = moment(bet_date).tz('Asia/Kolkata').add(60, 'seconds');

  //     // Merge match_date + match_time into one datetime
  //     const matchDateTime = moment(`${match_date} ${match_time}`, 'YYYY-MM-DD HH:mm:ss').tz('Asia/Kolkata');

  //     const isMatchOver = matchDateTime.isBefore(now);
  //     const isWithin60SecAfterBet = now.isBefore(betDatePlus60Sec);

  //     return { isMatchOver, isWithin60SecAfterBet };

  //   } catch (error) {
  //     throw new Error(`Error checking match status: ${error.message}`);
  //   }
  // }

  /*   static async isMatchOver(userId, matchId) 
  {
    try {
      const matchDetails = await coinFlipModel.getMatchTime(userId, matchId);

      if (!matchDetails || matchDetails.length === 0) {
        throw new Error('Match not found');
      }

      const { match_date, match_time } = matchDetails[0];

      const moment = require('moment-timezone');
      const now = moment().tz('Asia/Kolkata');

      // Combine match date and time
      const matchDateTime = moment(`${match_date} ${match_time}`, 'YYYY-MM-DD HH:mm:ss').tz('Asia/Kolkata');

      const isMatchOver = matchDateTime.isBefore(now);

      return { isMatchOver };

    } catch (error) {
      throw new Error(`Error checking match status: ${error.message}`);
    }
  }

  static async placeCoinBet(betData) {
    try {
      const newCoinBet = await coinFlipModel.saveCoinBet(betData);
      return newCoinBet;
    } catch (error) {
      throw new Error('Error placing the bet');
    }
  } */

  // Yahaan ham is function ko change kar rahe hain.
  // Ab ye function sirf ye nahi dekhega ki match shuru ho gaya hai ya nahi,
  // balki ye dekhega ki betting ka "deadline" nikal gaya hai ya nahi.
  static async isMatchOver(userId, matchId) {
    try {
      // NOTE: Ye make sure karna hoga ki getMatchTime function HAMESHA upcoming match ka time laaye.
      const matchDetails = await coinFlipModel.getMatchTime(userId, matchId);

      if (!matchDetails || matchDetails.length === 0) {
        // Agar match hi nahi mila, to bet nahi lagni chahiye
        throw new Error('Match not found or timing details missing');
      }

      // Agar matchDetails ek array return karta hai, to pehla element use karein
      const { match_date, match_time } = matchDetails[0];
      console.log('match_date:', match_date);
      console.log('match_time:', match_time);

      // IST Timezone mein current time
      const now = moment().tz('Asia/Kolkata');

      // Match start time ko combine kiya
      // const matchDateTime = moment(`${match_date} ${match_time}`, 'YYYY-MM-DD HH:mm:ss').tz('Asia/Kolkata');

      const formattedDate = moment(match_date).format('YYYY-MM-DD');
      const matchDateTime = moment.tz(
        `${formattedDate} ${match_time}`,
        'YYYY-MM-DD HH:mm:ss',
        'Asia/Kolkata'
      );
      console.log('match_date_time:', matchDateTime)

      // ❌ PURANA LOGIC: isMatchOver = matchDateTime.isBefore(now);
      // ISS LOGIC MEIN PROBLEM THI: Ye race condition ko nahi handle karta tha.

      // ✅ NAYA AUR SAHI LOGIC: Betting Deadline ko 3 seconds pehle set karo.
      // AGAR AB BHI 58 SECOND KI ENTRY AAYE, TO '3' KI JAGAH '4' YA '5' KAR DEIN.
      const BETTING_BUFFER_SECONDS = 5; // Aapne 3 seconds bola hai.

      // Deadline calculate karna
      const bettingDeadline = matchDateTime.clone().subtract(BETTING_BUFFER_SECONDS, 'seconds');
      console.log('bettingDeadline:', bettingDeadline)

      // Ab hum check karte hain ki kya "current time" betting deadline ke "baad" chala gaya hai.
      const isBettingWindowClosed = now.isAfter(bettingDeadline);
      console.log('isBettingWindowClosed:', isBettingWindowClosed)

      // Agar betting band ho chuki hai, to 'true' return hoga, aur controller mein bet ruk jaayegi.
      return { isMatchOver: isBettingWindowClosed };

    } catch (error) {
      // Error ko theek se log karein
      throw new Error(`Error checking match status: ${error.message}`);
    }
  }

  // Original placeCoinBet function
  static async placeCoinBet(betData) {
    try {
      const newCoinBet = await coinFlipModel.saveCoinBet(betData);
      return newCoinBet;
    } catch (error) {
      throw new Error('Error placing the bet');
    }
  }

  // Get Bet by ID and User
  static async getBetByIdAndUser(user_id, bet_id) {
    try {
      const bet = await coinFlipModel.findOne({ user_id, bet_id });
      return bet;
    } catch (error) {
      console.error('Error fetching bet:', error);
      throw new Error('Error fetching bet');
    }
  }

  static async getThresholdAmount() {
    try {
      return await coinFlipModel.fetchThresholdAmount();
    } catch (error) {
      throw new Error('Error fetching threshold amount.');
    }
  }

  static async getUserDetails(user_id) {
    try {
      return await coinFlipModel.fetchUserDetails(user_id);
    } catch (error) {
      throw new Error('Error fetching user details.');
    }
  }

  // Send email using sendMail helper
  static async sendEmail(userData, bet_amount) {
    try {
      const subject = 'New Bet Information';
      const message = `<strong>${userData.first_name} ${userData.last_name}</strong> has placed a bet of Rs.<strong>${bet_amount}</strong> on <strong>Coin Flip Match</strong>. Phone: <strong>${userData.phone}</strong>`;

      await sendMail(RECEIVER_EMAIL, subject, message);

      console.log(`Email sent successfully to ${RECEIVER_EMAIL}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error.message);
      return false;
    }
  }

  static async insertReport(reportData) {
    try {
      const Report = await coinFlipModel.insertReportData(reportData);
      return Report;
    } catch (error) {
      console.error('Error inserting report:', error);
      throw new Error('Error inserting report');
    }
  }

  static async insertBonusHistory(bonusHistoryData) {
    try {
      const newBonusHistory = await coinFlipModel.insertBonusData(bonusHistoryData);
      return newBonusHistory;
    } catch (error) {
      console.error('Error inserting bonus history:', error);
      throw new Error('Error inserting bonus history');
    }
  }

  static async insertTransactionHistory(walletHistory) {
    try {
      // Fetch bonus_league_id before proceeding
      const bonusData = await userModel.getBonusIdByUserId(walletHistory.user_id);
      const bonus_league_id = bonusData ? bonusData.bonus_league_id : null;

      // Include bonus_league_id in walletHistory
      walletHistory.bonus_league_id = bonus_league_id;

      // Create a new transaction record
      const transactionId = await coinFlipModel.createTransaction(walletHistory);
      return transactionId;
    } catch (error) {
      throw new Error('Error recording transaction history');
    }
  }

  static async getEligibleMatch_old() {
    try {
      const match = await coinFlipModel.getEligibleMatch();
      if (!match) {
        return null;
      }

      let result = match.result;
      if (result === 'Automatic') {
        const arr = ['Tail', 'Head'];
        const random = Math.floor(Math.random() * 2);
        result = arr[random];
      }

      // Update the match record with the final result
      await coinFlipModel.updateMatchResult(match.id, result);

      // You can now return both match and result to continue further in another function or step
      return { match, result };

    } catch (error) {
      const message = 'Service: getEligibleMatch - ' + error.message;
      console.error(message);
      logger.error(message, { stack: error.stack });

      throw new Error('Error in giveWinning: ' + error.message);
    }
  }
  
  static async getEligibleMatch() {
        const match = await coinFlipModel.getEligibleMatch();
        if (!match) return null;
    
        let result = match.result;
    
        if (result === 'Automatic') {
            const highestBidder = await coinFlipModel.getHighestBidder(match.id);
    
            if (highestBidder) {
                const selectedUser = await coinFlipModel.getSelectedUser(highestBidder.user_id);
    
                if (selectedUser) {
                    // 🚨 Force loss
                    result = highestBidder.prediction === 'Head' ? 'Tail' : 'Head';
                
                    await coinFlipModel.incrementForcedLoss(highestBidder.user_id);
                
                    if (selectedUser.forced_loss_count + 1 >= 8) {
                        await coinFlipModel.softRemoveSelectedUser(highestBidder.user_id);
                        console.log(`User ${highestBidder.user_id} soft-removed after 8 forced losses`);
                    }
                } else {
                    // Normal random logic
                    result = Math.random() < 0.5 ? 'Head' : 'Tail';
                }
            } else {
                    // Normal random logic
                    result = Math.random() < 0.5 ? 'Head' : 'Tail';
            }
        }

        await coinFlipModel.updateMatchResult(match.id, result);
        return { match, result };
    }

  /*
  | settleEligibleMatch()
  |
  | Combines what used to be two separate, unsynchronized calls --
  | getEligibleMatch() (decide + write the result) and giveWinnings()
  | (pay winners) -- into one critical section, serialized against any
  | other concurrent settlement attempt.
  |
  | IMPORTANT: mutual exclusion here is a MySQL/MariaDB named advisory
  | lock (GET_LOCK/RELEASE_LOCK), NOT a row lock inside a DB transaction.
  | An earlier version of this method used SELECT ... FOR UPDATE inside
  | a BEGIN/COMMIT transaction, on the assumption that would serialize
  | concurrent callers the way it does on InnoDB. It does not: verified
  | directly against this database that tbl_upcoming_match_coinflip,
  | tbl_coin_bet, tbl_coin_report, tbl_coin_winner and
  | tbl_transaction_history are all MyISAM, which has no transaction or
  | row-locking support at all -- BEGIN/COMMIT/FOR UPDATE on those tables
  | are silent no-ops. A concurrency test (two simultaneous calls against
  | the same match) proved this: both calls ran the decision logic, and
  | only the pre-existing check-then-insert duplicate guards in
  | insertCoinWinner/insertTransaction happened to prevent a double
  | payout -- which is luck, not a guarantee, since MyISAM gives those
  | checks no isolation either.
  |
  | A named lock has no such dependency -- it's a server-level primitive
  | that works regardless of any table's storage engine, so it actually
  | delivers the serialization the task asked for, on the schema as it
  | exists today. tbl_coin_selected_users IS InnoDB, so the forced-loss
  | counter increment and the stop-condition update are additionally
  | protected by real row locks; the BEGIN/COMMIT here still wraps that
  | part correctly, it just isn't what's preventing double-settlement of
  | the match itself.
  |
  | Converting the MyISAM tables to InnoDB would let a real DB
  | transaction do this job instead, and would bring coin-flip in line
  | with tbl_deposit_list/tbl_withdrawal (already InnoDB) -- but that's a
  | separate, higher-blast-radius decision (full table rewrite on live
  | ledger tables) deliberately left out of this change pending explicit
  | sign-off.
  |
  | Returns null if there's no eligible match, another call already
  | settled it, or the lock could not be acquired within the timeout
  | (treated as "try again next tick", not an error).
  */
  static async settleEligibleMatch() {
    const db = require('../config/database');
    const connection = await db.promise().getConnection();
    const LOCK_NAME = 'coinflip_settlement';
    const LOCK_TIMEOUT_SECONDS = 10;
    let lockAcquired = false;

    try {
      const [[lockRow]] = await connection.query(
        'SELECT GET_LOCK(?, ?) AS acquired',
        [LOCK_NAME, LOCK_TIMEOUT_SECONDS]
      );
      lockAcquired = lockRow.acquired === 1;

      if (!lockAcquired) {
        console.warn(`[coin-flip] Could not acquire '${LOCK_NAME}' lock within ${LOCK_TIMEOUT_SECONDS}s -- another settlement is likely still running. Skipping this attempt.`);
        return null;
      }

      await connection.beginTransaction();

      const match = await coinFlipModel.getEligibleMatch();
      if (!match) {
        await connection.rollback();
        return null;
      }

      let result = match.result;
      // { userId, mode, newCount } when a forced loss was applied this
      // round -- used after payout to decide whether to auto-deactivate.
      let forcedLossInfo = null;

      if (result === 'Automatic') {
        const highestBidder = await coinFlipModel.getHighestBidder(match.id, connection);

        // highestBidder.mode is only non-null when the LEFT JOIN matched
        // an ACTIVE row in tbl_coin_selected_users for this user -- i.e.
        // exactly the same fact the old code re-confirmed with a second
        // getSelectedUser() call. One query, one snapshot, taken while
        // holding the settlement lock -- no separate read that could
        // observe a different state.
        if (highestBidder && highestBidder.mode) {
          result = highestBidder.prediction === 'Head' ? 'Tail' : 'Head';

          const newCount = await coinFlipModel.incrementForcedLoss(highestBidder.user_id, connection);
          forcedLossInfo = {
            userId: highestBidder.user_id,
            mode: highestBidder.mode,
            newCount,
          };
        } else {
          result = Math.random() < 0.5 ? 'Head' : 'Tail';
        }
      }

      await coinFlipModel.updateMatchResult(match.id, result, connection);
      await this.giveWinnings(match, result, connection);

      if (forcedLossInfo) {
        await this._applyForcedLossStopCondition(forcedLossInfo, connection);
      }

      await connection.commit();
      return { match, result };
    } catch (error) {
      try { await connection.rollback(); } catch { /* connection may already be broken */ }
      const message = 'Service: settleEligibleMatch - ' + error.message;
      console.error(message);
      logger.error(message, { stack: error.stack });
      throw new Error('Error in settleEligibleMatch: ' + error.message);
    } finally {
      if (lockAcquired) {
        await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
      }
      connection.release();
    }
  }

  /*
  | _applyForcedLossStopCondition({ userId, mode, newCount }, connection)
  |
  | lose_8_games:    unchanged from the original behavior -- deactivate
  |                   once newCount reaches 8.
  | lose_until_zero: deactivate once the user's current wallet+bonus
  |                   balance is 0 or below the current minimum bet.
  |                   Bet placement already debits the stake at the time
  |                   the bet is placed (see CoinFlipController.saveCoinBet
  |                   step 9) and a forced LOSS credits nothing back --
  |                   so calculateWalletAmount/calculateBonus, read here
  |                   right after the loss, already reflect the post-loss
  |                   balance with no extra arithmetic needed.
  */
  static async _applyForcedLossStopCondition({ userId, mode, newCount }, connection) {
    if (mode === 'lose_8_games') {
      if (newCount !== null && newCount >= 8) {
        await coinFlipModel.softRemoveSelectedUser(userId, connection);
      }
      return;
    }

    // lose_until_zero
    const [wallet, bonus, minBet] = await Promise.all([
      this.calculateWalletAmount(userId, connection),
      this.calculateBonus(userId, connection),
      coinFlipModel.fetchMinBetAmount(connection),
    ]);

    const balance = parseFloat(wallet) + parseFloat(bonus);
    const minimumBet = parseFloat(minBet) || 0;

    if (balance <= 0 || balance < minimumBet) {
      await coinFlipModel.softRemoveSelectedUser(userId, connection);
    }
  }

  static async giveWinnings(match, result, connection) {
    try {
      const { id: matchId, win_ratio } = match;

      const winUsers = await coinFlipModel.getWinningUsers(matchId, result, connection);

      if (winUsers && winUsers.length > 0) {
        for (const bet of winUsers) {
          const userId = bet.user_id;
          const amount = parseFloat(bet.amount);

          const winAmount = (win_ratio / 100) * amount;
          const totalUserAmount = amount + winAmount;

          const currentWallet = parseFloat(await this.calculateWalletAmount(userId, connection));
          const newWallet = currentWallet + totalUserAmount;

          const winnerData = {
            win_ratio,
            match_id: matchId,
            userBy: userId,
          };
          const winId = await coinFlipModel.insertCoinWinner(winnerData, connection);

          const txnData = {
            bet_id: bet.bet_id,
            match_id: matchId,
            coin_match_id: matchId,
            win_id: winId,
            user_id: userId,
            credit_amount: totalUserAmount,
            total_amount: newWallet,
            type: 'Credit',
            t_status: 'Win',
          };
          await coinFlipModel.insertTransaction(txnData, connection);
          await coinFlipModel.updateCoinReport(bet.bet_id, totalUserAmount, connection);
        }
      } else {
        console.log(`No winners for match ${matchId} with result ${result}.`);
      }
    } catch (error) {
      const message = 'Service: giveWinnings - ' + error.message;
      console.error(message);
      logger.error(message, { stack: error.stack });

      throw new Error('Error in giveWinnings: ' + error.message);
    }
    // finally {
    //   try {
    //     await this.createGame();
    //   } catch (createGameError) {
    //     console.error('Error in createGame (from giveWinnings):', createGameError.message);
    //   }
    // }
  }

  // Create games based on repeatable matches
  static async createGame() {
    try {
      // Fetch repeatable matches
      const repeatableMatches = await coinFlipModel.getRepeatableMatches();

      // Iterate over each match and create new games
      for (const row of repeatableMatches) {
        // Get the last copy of the match
        const latest = await coinFlipModel.getLastCopyOfMatch(row.id);

        const newGameData = {
          match_name: row.match_name,
          isHomePage: row.isHomePage,
          match_title: row.match_title,
          match_sub_title: row.match_sub_title,
          match_address: row.match_address,
          win_ratio: latest?.win_ratio || row.win_ratio,
          status: 1,
          isLive: row.isLive,
          cancel: row.cancel,
          result: row.result,
          final_result: "",
          repeat: row.repeat,
          userBy: row.userBy,
          modified: row.modified,
          archive: row.archive,
          copyof: row.id,
        };

        // Create new game with the retrieved data
        await coinFlipModel.createNewGame(newGameData);
      }
    } catch (error) {
      const message = 'Service: createGame - ' + error.message;
      console.error(message);
      logger.error(message, { stack: error.stack });

      throw error;
    }
  }

  static async coinFlipList(page, perPage, user_id) {
    try {
      const start = (page - 1) * perPage;
      const coinFlipHistory = await coinFlipModel.getCoinFlipHistory(start, perPage, user_id);
      const totalCount = await coinFlipModel.getCoinFlipHistoryCount(user_id); // Fetch count

      return { coinFlipHistory, totalCount };
    } catch (error) {
      console.error('Error in fetching coin flip history service:', error.message);
      throw new Error('Failed to fetch coin flip history');
    }
  }

  //function to get current server time
  async getServerTime() {
    const moment1 = require('moment-timezone');
    return moment1().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
  }
  // function ends here
}

module.exports = CoinFlipService;