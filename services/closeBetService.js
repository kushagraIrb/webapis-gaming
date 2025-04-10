const closeBetModel = require('../models/closeBetModel');
const moment = require("moment-timezone");

class closeBetService {
    static async getCloseBetHistory(page, perPage) {
        try {
            const start = (page - 1) * perPage;
            const matches = await closeBetModel.getCloseBetData(start, perPage);
    
            const currentTime = moment().tz("Asia/Kolkata");
    
            let closedMatches = [];
    
            matches.forEach(match => {
                try {
                    // Convert match_date to IST
                    const matchDateIST = moment.utc(match.match_date).tz("Asia/Kolkata");
    
                    // Parse match_time array
                    const matchTimeArray = JSON.parse(match.match_time);
                    if (!Array.isArray(matchTimeArray) || matchTimeArray.length === 0) {
                        return;
                    }
    
                    // Take only the last match time
                    const lastMatchTime = matchTimeArray[matchTimeArray.length - 1];
    
                    // Combine match_date (IST) and last match_time
                    const [lastHours, lastMinutes] = lastMatchTime.split(":").map(Number);
                    const lastMatchDateTimeIST = matchDateIST.clone().set({ hour: lastHours, minute: lastMinutes, second: 0 });
    
                    // Determine if the match is closed
                    const isClosed = lastMatchDateTimeIST.isSameOrBefore(currentTime);
    
                    if (isClosed) {
                        closedMatches.push({
                            ...match,
                            lastMatchDateTimeIST: lastMatchDateTimeIST.format("YYYY-MM-DD HH:mm:ss"),
                        });
                    }
                } catch (err) {
                    throw new Error(`Match ID ${match.id} - Error processing match:`, err.message);
                }
            });
    
            return { closedMatches, totalCount: closedMatches.length };
        } catch (error) {
            console.error('Error in closeBetService:', error.message);
            throw new Error('Failed to fetch live bet matches');
        }
    }
    
}

module.exports = closeBetService;