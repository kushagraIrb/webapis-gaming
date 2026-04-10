const closeBetModel = require('../models/closeBetModel');
const moment = require("moment-timezone");

class closeBetService {
    static async getCloseBetHistory(page, perPage) {
        try {
            // Fetch all matches for today (no pagination at DB level)
            const allMatches = await closeBetModel.getAllTodayMatches(); // 🚨 new method, no LIMIT

            const currentTime = moment().tz("Asia/Kolkata");
            let closedMatches = [];

            allMatches.forEach(match => {
                try {
                    const matchDateIST = moment.utc(match.match_date).tz("Asia/Kolkata");
                    const matchTimeArray = JSON.parse(match.match_time);
                    if (!Array.isArray(matchTimeArray) || matchTimeArray.length === 0) {
                        return;
                    }

                    const lastMatchTime = matchTimeArray[matchTimeArray.length - 1];
                    const [lastHours, lastMinutes] = lastMatchTime.split(":").map(Number);
                    const lastMatchDateTimeIST = matchDateIST.clone().set({
                        hour: lastHours,
                        minute: lastMinutes,
                        second: 0,
                    });

                    const isClosed = lastMatchDateTimeIST.isSameOrBefore(currentTime);

                    if (isClosed) {
                        closedMatches.push({
                            ...match,
                            lastMatchDateTimeIST: lastMatchDateTimeIST.format("YYYY-MM-DD HH:mm:ss"),
                        });
                    }
                } catch (err) {
                    console.error(`Match ID ${match.id} - Error processing match:`, err.message);
                }
            });

            // Pagination logic (after filtering closed matches)
            const totalCount = closedMatches.length;
            const start = (page - 1) * perPage;
            const paginatedMatches = closedMatches.slice(start, start + perPage);

            return {
                closedMatches: paginatedMatches,
                totalCount
            };
        } catch (error) {
            console.error('Error in closeBetService:', error.message);
            throw new Error('Failed to fetch closed bet matches');
        }
    }
}

module.exports = closeBetService;
