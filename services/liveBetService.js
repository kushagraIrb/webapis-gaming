const liveBetModel = require('../models/liveBetModel');
const userModel = require('../models/userModel');
const moment = require('moment-timezone');
const crypto = require('crypto');
require("dotenv").config();

class LiveBetService {
  static async homeListingMatches() {
    try {
      const matches = await liveBetModel.fetchHomeLiveMatches();
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

      const upcomingMatches = matches.filter(match => {
        try {
          const matchTimeArray = JSON.parse(match.match_time);
          const matchTime = Array.isArray(matchTimeArray) ? matchTimeArray[matchTimeArray.length - 1] : matchTimeArray;

          const matchDate = new Date(match.match_date);
          if (isNaN(matchDate)) {
            return false;
          }

          const [hours, minutes] = matchTime.split(":").map(Number);
          matchDate.setHours(hours, minutes, 0, 0);

          return matchDate > now;
        } catch (err) {
          return false;
        }
      });

      for (const match of upcomingMatches) {
        const encryptedId = await this.encryptId(match.id);
        await liveBetModel.updateEncryptedId(match.id, encryptedId);
        match.encrypted_id = encryptedId;
      }

      return upcomingMatches;
    } catch (error) {
      throw new Error('Failed to fetch live matches');
    }
  }

    static async getUserPincode(userId) {
      try {
        const user = await liveBetModel.fetchUserPincode(userId);
        return user?.pincode || null;
      } catch (error) {
        console.error('Error fetching user pincode:', error.message);
        throw new Error('Failed to fetch user pincode');
      }
    }

    static async encryptId(id) {
      const secretKey = crypto.createHash('sha256').update(process.env.SECRET_KEY).digest('base64').substr(0, 32); // The key must be exactly 32 bytes for aes-256-cbc. If your SECRET_KEY is shorter or longer, pad or trim it
      if (!secretKey) throw new Error('Missing secret key for encryption');
      
      // Generate an initialization vector (IV)
      const iv = Buffer.alloc(16, 0); // 16-byte IV with zeros

      // Create a Cipher instance
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey), iv);

      // Encrypt the ID
      let encrypted = cipher.update(String(id), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return encrypted;
    }

    static async getLiveMatches(userId) {
      try {
        const matches = await liveBetModel.fetchLiveMatches();
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

        const upcomingMatches = matches.filter(match => {
          try {
            const matchTimeArray = JSON.parse(match.match_time);
            if (!Array.isArray(matchTimeArray) || matchTimeArray.length === 0) {
              return false;
            }

            const matchDate = new Date(match.match_date);
            if (isNaN(matchDate)) {
              return false;
            }

            // Get first and last match times
            const firstMatchTime = matchTimeArray[0];
            const lastMatchTime = matchTimeArray.length > 1 ? matchTimeArray[matchTimeArray.length - 1] : firstMatchTime;

            // Extract time values
            const [firstHours, firstMinutes] = firstMatchTime.split(":").map(Number);
            const [lastHours, lastMinutes] = lastMatchTime.split(":").map(Number);

            // Create date objects for first and last match times
            const firstMatchDate = new Date(matchDate);
            firstMatchDate.setHours(firstHours, firstMinutes, 0, 0);

            const lastMatchDate = new Date(matchDate);
            lastMatchDate.setHours(lastHours, lastMinutes, 0, 0);

            // Adjust lastMatchDate if it crosses midnight
            if (lastHours < firstHours || (lastHours === firstHours && lastMinutes < firstMinutes)) {
              lastMatchDate.setDate(lastMatchDate.getDate() + 1);
            }

            // Display match if last match time is in the future
            return lastMatchDate > now;
          } catch (err) {
            return false;
          }
        });

        const matchIds = upcomingMatches.map(match => match.id);
        const userBets = await liveBetModel.getUserBetIds(userId, matchIds);

        for (const match of upcomingMatches) {
          const encryptedId = await this.encryptId(match.id);
          await liveBetModel.updateEncryptedId(match.id, encryptedId);
          match.encrypted_id = encryptedId;

          // Include bet_id only if the current time is less than the first match time
          const matchTimeArray = JSON.parse(match.match_time);
          if (!Array.isArray(matchTimeArray) || matchTimeArray.length === 0) {
            match.bet_id = null;
            continue;
          }

          const firstMatchTime = matchTimeArray[0];
          const [firstHours, firstMinutes] = firstMatchTime.split(":").map(Number);

          const firstMatchDate = new Date(match.match_date);
          firstMatchDate.setHours(firstHours, firstMinutes, 0, 0);

          match.bet_id = now < firstMatchDate ? (userBets[match.id] || null) : null;
        }

        return upcomingMatches;
      } catch (error) {
        console.error('Error fetching live:', error.message);
        throw new Error('Failed to fetch live matches');
      }
    }
  
    // static async getPastMatches() {
    //     try {
    //         return await liveBetModel.fetchPastMatches();
    //     } catch (error) {
    //         console.error('Error fetching past matches:', error.message);
    //         throw new Error('Failed to fetch past matches');
    //     }
    // }

    static async getMatchDetails(encryptedMatchId) {
      try {
          const match = await liveBetModel.fetchMatchById(encryptedMatchId);
          if (!match) {
            throw new Error("Match not found");
          }
  
          const teamOneUsers = await liveBetModel.fetchUsersInTeam(match.id, match.team_one_id);
          const teamTwoUsers = await liveBetModel.fetchUsersInTeam(match.id, match.team_two_id);
          const totalUsers = await liveBetModel.fetchTotalUsersInMatch(match.id);
  
          const teamOneTossRatio = totalUsers > 0 ? (teamOneUsers / totalUsers) * 100 : 0;
          const teamTwoTossRatio = totalUsers > 0 ? (teamTwoUsers / totalUsers) * 100 : 0;
  
          return {
            ...match,
            teamOneTossRatio: teamOneTossRatio.toFixed(2),
            teamTwoTossRatio: teamTwoTossRatio.toFixed(2),
          };
      } catch (error) {
          console.error("Error fetching live match details:", error.message);
          throw new Error("Failed to fetch live match details");
      }
    }  

    static async getTossTypes() {
        try {
            return await liveBetModel.fetchTossTypes();
        } catch (error) {
            console.error('Error fetching toss type:', error.message);
            throw new Error('Failed to fetch toss type');
        }
        
    }

    static async getMinBetAmount() {
        try {
            return await liveBetModel.fetchMinBetAmount();
        } catch (error) {
            console.error('Error fetching minimum bet amount:', error.message);
            throw new Error('Failed to fetch minimum bet amount');
        }
        
    }

    static async getUserBets(userId, encryptedMatchId) {
        try {
            return await liveBetModel.fetchUserBets(userId, encryptedMatchId);
        } catch (error) {
            console.error('Error fetching user bets:', error.message);
            throw new Error('Failed to fetch user bets');
        }
    }

    static async checkBettingStatus() {
      try {
          return await liveBetModel.getBettingStatus();
      } catch (error) {
          console.error('Error fetching betting status:', error.message);
          throw new Error('Failed to fetch betting status');
      }
    }

    static async checkWinnerAnnounced(matchId) {
      try {
        // Fetch match details using the match ID
        const matchDetails = await liveBetModel.getMatchById(matchId);

        // Check if matchDetails contains data
        if (matchDetails && matchDetails.length > 0) {
          return true; // Match details exist
        } else {
          return false; // No match found
        }
      } catch (error) {
        throw new Error('Error checking winner announcement');
      }
    }

    static async calculateWalletAmount(userId) {
      try {
        // Step 1: Get the maximum transaction ID for the user
        const maxTransId = await liveBetModel.getMaxTransactionId(userId);
        if (!maxTransId) {
          return 0; // No transactions found
        }
  
        // Step 2: Get the wallet amount for the maximum transaction ID
        const walletAmount = await liveBetModel.getWalletAmountByTransactionId(maxTransId);
        return walletAmount;
      } catch (error) {
        throw new Error('Error calculating wallet amount');
      }
    }

    static async getBetAmount(betId) {
      try {
        const betAmount = await liveBetModel.fetchBetAmount(betId);
        return betAmount;
      } catch (error) {
        console.error("Error fetching bet amount in service:", error);
        throw new Error('Error fetching bet amount');
      }
    }

    static async getNumberOfCancelBet(userId, matchId) {
      try {
        return await liveBetModel.fetchNumberOfCancelBet(userId, matchId);
      } catch (error) {
        throw new Error('Error fetching cancelled bets count');
      }
    }

    static async CalculateBetCancelCharge(debitAmount) {
      try {
        return await liveBetModel.CalculateBetCancelCharge(debitAmount);
      } catch (error) {
        throw new Error("Error calculating bet cancellation charge.");
      }
    }

    static async refundWallet(refundData) {
      try {
        // Fetch bonus_league_id before proceeding
        const bonusData = await userModel.getBonusIdByUserId(refundData.user_id);
        const bonus_league_id = bonusData ? bonusData.bonus_league_id : null;

        // Include bonus_league_id in walletHistory
        refundData.bonus_league_id = bonus_league_id;

        const insertStatus = await liveBetModel.insertRefundTransaction(refundData);
        return insertStatus;
      } catch (error) {
        console.error("Error refunding wallet:", error);
        throw new Error('Error processing wallet refund');
      }
    }

    static async cancelBet(betId) {
      try {
        const updateStatus = await liveBetModel.updateBetStatus(betId);
        return updateStatus;
      } catch (error) {
        console.error("Error canceling bet:", error);
        throw new Error('Error updating bet status');
      }
    }
    
    static async calculateBonus(userId) {
      try {
        // Step 1: Get the maximum bonus ID for the user
        const maxBonusId = await liveBetModel.getMaxBonusId(userId);
        if (!maxBonusId) {
          return 0; // No bonuses found
        }
  
        // Step 2: Get the bonus amount for the maximum bonus ID
        const bonusAmount = await liveBetModel.getBonusAmountByBonusId(maxBonusId);
        return bonusAmount;
      } catch (error) {
        throw new Error('Error fetching bonus amount');
      }
    }

    static async isMatchCancelled(matchId) {
      try {
        const match = await liveBetModel.getMatchStatus(matchId);
        return match && match[0].cancel; // Assuming `cancel` is a boolean in match data
      } catch (error) {
        throw new Error('Error checking match status');
      }
    }

    static async isBetCancelled(userId, bet_id) {
      try {
        const bet = await liveBetModel.getBetStatus(userId, bet_id);
        return bet && bet.status === 0; // If status is 0, bet is cancelled
      } catch (error) {
        throw new Error('Error checking bet status');
      }
    }

    // static async checkAlreadyBet(userId, matchId) {
    //   try {
    //     // Check if a bet record exists for the user and match
    //     const betExists = await liveBetModel.userHasBetOnMatch(userId, matchId);
    //     return !!betExists;
    //   } catch (error) {
    //     throw new Error('Error checking existing bet');
    //   }
    // }

    static async checkAlreadyBet(userId, matchId) {
      try {
        // Get match details from tbl_upcoming_match
        const matchDetails = await liveBetModel.getMatchTime(matchId);

        if (!matchDetails || matchDetails.length === 0) {
          throw new Error('Match not found');
        }

        // Extract match_date and match_time
        let { match_date, match_time } = matchDetails[0];

        // Convert match_date (UTC) to Asia/Kolkata timezone
        const formattedMatchDate = moment.utc(match_date).tz('Asia/Kolkata').format('YYYY-MM-DD');

        // Parse match_time (if stored as JSON string)
        let parsedMatchTime;
        try {
            parsedMatchTime = Array.isArray(match_time) ? match_time : JSON.parse(match_time);
        } catch (err) {
          throw new Error('Invalid match_time format');
        }

        if (!Array.isArray(parsedMatchTime) || parsedMatchTime.length === 0) {
          throw new Error('Invalid match_time data');
        }

        // Get the first match time
        const firstMatchTime = parsedMatchTime[0];

        // Combine formattedMatchDate with firstMatchTime
        const matchDateTime = moment.tz(`${formattedMatchDate} ${firstMatchTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');

        if (!matchDateTime.isValid()) {
          throw new Error('Invalid match datetime');
        }

        // Get current time in Asia/Kolkata timezone
        const currentTime = moment().tz('Asia/Kolkata');

        // If current time is greater than match_time[0], return false
        if (currentTime.isAfter(matchDateTime)) {
            return false;
        }

        // Check if a bet exists where bet_date < matchDateTime
        const betExists = await liveBetModel.userHasBetOnMatch(userId, matchId, matchDateTime.format('YYYY-MM-DD HH:mm:ss'));

        return !!betExists;
      } catch (error) {
        console.error('Error checking existing bet:', error.message);
        throw new Error('Error checking existing bet');
      }
    }  

    static async isMatchOver(matchId) {
      try {
        // Fetch match details using the match ID
        const matchDetails = await liveBetModel.getMatchTime(matchId);

        if (!matchDetails || matchDetails.length === 0) {
          throw new Error('Match not found');
        }

        // Extract match_date and match_time
        const { match_date, match_time } = matchDetails[0];

        // Parse match_date in Asia/Kolkata timezone and format it
        const matchDate = moment(match_date).tz('Asia/Kolkata').format('YYYY-MM-DD');

        // Convert match_date string to a JavaScript Date object (in Asia/Kolkata timezone)
        let matchDateTime = moment(matchDate, 'YYYY-MM-DD').tz('Asia/Kolkata');

        // Parse match_time (assumed to be in JSON format, e.g., ["12:33", "15:00"])
        let parsedMatchTime = JSON.parse(match_time);

        if (!Array.isArray(parsedMatchTime) || parsedMatchTime.length === 0) {
          throw new Error('Invalid match_time format');
        }

        // Existing logic: Take the last time in the array
        const lastTime = parsedMatchTime[parsedMatchTime.length - 1];
        const [lastHours, lastMinutes] = lastTime.split(':');

        // Set the last match time to matchDateTime
        matchDateTime.set('hour', lastHours);
        matchDateTime.set('minute', lastMinutes);

        // Get the current time in Asia/Kolkata timezone
        const now = moment().tz('Asia/Kolkata');

        // Compare last match time and now
        const isMatchOver = matchDateTime.isBefore(now);

        // New Logic: Check if the first match time has passed
        const firstTime = parsedMatchTime[0];
        const [firstHours, firstMinutes] = firstTime.split(':');
        let firstMatchDateTime = moment(matchDate, 'YYYY-MM-DD').tz('Asia/Kolkata');
        firstMatchDateTime.set('hour', firstHours);
        firstMatchDateTime.set('minute', firstMinutes);

        const isFirstMatchTimePassed = firstMatchDateTime.isBefore(now);

        return { isMatchOver, isFirstMatchTimePassed };
      } catch (error) {
        throw new Error(`Error checking match status: ${error.message}`);
      }
    } 
    
    static async placeBet(betData) {
        try {
          const newBet = await liveBetModel.placeBet(betData);
          return newBet;
        } catch (error) {
          throw new Error('Error placing the bet');
        }
    }

    // Get Bet by ID and User
    static async getBetByIdAndUser(user_id, bet_id) {
        try {
            const bet = await liveBetModel.findOne({ user_id, bet_id });
            return bet;
        } catch (error) {
            console.error('Error fetching bet:', error);
            throw new Error('Error fetching bet');
        }
    }

    static async insertReport(reportData) {
        try {
            const Report = await liveBetModel.insertReportData(reportData);
            return Report;
        } catch (error) {
            console.error('Error inserting report:', error);
            throw new Error('Error inserting report');
        }
    }

    static async insertBonusHistory(bonusHistoryData) {
        try {
            const newBonusHistory = await liveBetModel.insertBonusData(bonusHistoryData);
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
        const transactionId = await liveBetModel.createTransaction(walletHistory);
        return transactionId;
      } catch (error) {
        throw new Error('Error recording transaction history');
      }
    }

    static async findUserById(user_id) {
      try {
        const user = await liveBetModel.findUserById(user_id);
        return user;
        return user ? user.wallet_balance : 0;
      } catch (error) {
        console.error('Error fetching wallet amount:', error);
        throw new Error('Error fetching wallet amount');
      }
    }

    static async cancelLiveBet(betData) {
      try {
        const newBet = await liveBetModel.cancelLiveBet(betData);
        return newBet;
      } catch (error) {
        throw new Error('Error placing the bet');
      }
    }

    static async getExtraTimeList() {
      try {
        const matches = await liveBetModel.fetchExtraTimeLiveMatches();
        const todayDateTime = moment().tz('Asia/Kolkata'); // Get current time in Asia/Kolkata timezone

        const processedMatches = matches
            .map(match => {
                const matchTimes = JSON.parse(match.match_time || '[]');

                // Check if match_date is a valid Date object
                let matchDate = match.match_date;

                if (matchDate instanceof Date && !isNaN(matchDate)) {
                    // If match_date is a valid Date object, format it as a string
                    const matchDateStr = moment(matchDate).tz('Asia/Kolkata').format('YYYY-MM-DD'); // Convert to Asia/Kolkata timezone and format as 'YYYY-MM-DD'

                    // Process each match time and create DateTime for comparison
                    let validMatchFound = false;
                    for (let matchTime of matchTimes) {
                        // Construct full DateTime string combining match date and match time
                        const matchDateTime = moment.tz(`${matchDateStr}T${matchTime}:00`, 'Asia/Kolkata');

                        // Check if the match is in the future
                        if (matchDateTime.isAfter(todayDateTime)) {
                            validMatchFound = true;
                            break; // If one match time is valid, we stop and include the match
                        }
                    }

                    if (validMatchFound) {
                        return {
                            match_name: match.match_name,
                            match_date: match.match_date,
                            match_time: matchTimes, // Return match_time as an array
                            win_ratio: JSON.parse(match.win_ratio || '[]') // Return win_ratio as an array
                        };
                    } else {
                        console.log(`Match ID: ${match.id} is in the past`);
                    }
                } else {
                    console.log(`Match ID: ${match.id} has invalid match date`);
                }

                return null; // Properly filter invalid matches
            })
            .filter(match => match !== null);
        return processedMatches;
    } catch (error) {
        console.error('Error fetching match list:', error.message);
        throw new Error('Failed to fetch match list');
    }
  }
}

module.exports = LiveBetService;