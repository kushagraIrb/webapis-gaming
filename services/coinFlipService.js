const coinFlipModel = require('../models/coinFlipModel');
const userModel = require('../models/userModel');
const sendMail = require('../helpers/sendMail');
require("dotenv").config();

class CoinFlipService {
  static async currentCoinFlipMatch() {
    try {
      return await coinFlipModel.fetchCurrentMatch();
    } catch (error) {
      throw new Error('Failed to fetch current coin flip match or bet amount.');
    }
  }

  static async minBetAmount(copyof) {
    try {
      return await coinFlipModel.fetchMinBetAmount();
    } catch (error) {
      throw new Error('Failed to get past results.');
    }
  }

  static async getPastResults(copyof) {
    try {
      const results = await coinFlipModel.fetchPastResults(copyof);
      return results.map(row => row.final_result);
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

  static async checkBettingStatus() {
    try {
        return await coinFlipModel.getBettingStatus();
    } catch (error) {
        console.error('Error fetching betting status:', error.message);
        throw new Error('Failed to fetch betting status');
    }
  }

  static async calculateWalletAmount(userId) {
    try {
      // Step 1: Get the maximum transaction ID for the user
      const maxTransId = await coinFlipModel.getMaxTransactionId(userId);
      if (!maxTransId) {
        return 0; // No transactions found
      }

      // Step 2: Get the wallet amount for the maximum transaction ID
      const walletAmount = await coinFlipModel.getWalletAmountByTransactionId(maxTransId);
      return walletAmount;
    } catch (error) {
      throw new Error('Error calculating wallet amount');
    }
  }

  static async calculateBonus(userId) {
    try {
      // Step 1: Get the maximum bonus ID for the user
      const maxBonusId = await coinFlipModel.getMaxBonusId(userId);
      if (!maxBonusId) {
        return 0; // No bonuses found
      }

      // Step 2: Get the bonus amount for the maximum bonus ID
      const bonusAmount = await coinFlipModel.getBonusAmountByBonusId(maxBonusId);
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

  static async isMatchOver(userId, matchId) {
    try {
      const matchDetails = await coinFlipModel.getMatchTime(userId, matchId);
  
      if (!matchDetails || matchDetails.length === 0) {
        throw new Error('Match not found');
      }
  
      const { bet_date, match_date, match_time } = matchDetails[0];
  
      const moment = require('moment-timezone');
      const now = moment().tz('Asia/Kolkata');
  
      // Convert bet_date and add 60 seconds
      const betDatePlus60Sec = moment(bet_date).tz('Asia/Kolkata').add(60, 'seconds');
  
      // Merge match_date + match_time into one datetime
      const matchDateTime = moment(`${match_date} ${match_time}`, 'YYYY-MM-DD HH:mm:ss').tz('Asia/Kolkata');
  
      const isMatchOver = matchDateTime.isBefore(now);
      const isWithin60SecAfterBet = now.isBefore(betDatePlus60Sec);
  
      return { isMatchOver, isWithin60SecAfterBet };
  
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
      
      const recipientEmails = [
        'bhushankatkar111@gmail.com',
        'Ankitgoyal4691@gmail.com',
        'Joker88563@gmail.com'
      ];

      for (const email of recipientEmails) {
        await sendMail(email, subject, message);
      }

      console.log('Email sent successfully.');
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
}

module.exports = CoinFlipService;