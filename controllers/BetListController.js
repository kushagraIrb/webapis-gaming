const { logger } = require('../logger');
const betListService = require('../services/betListService');
const moment = require('moment-timezone');

class BetController {
    // Fetch bet list for a user
    async getBettingOrderList(req, res) {
        try {
            const userId = req.user_id;
            const { page = 1, perPage = 10 } = req.query;
    
            const result = await betListService.fetchBettingOrderList(userId, Number(page), Number(perPage));
            const { total_count, betList } = result;
    
            await Promise.all(betList.map(async (bet) => {
                const isMatchWinnerAnnounced = await betListService.isMatchWinnerAnnounced(bet.match_id);
                bet.winSt = isMatchWinnerAnnounced
                    ? (await betListService.winnerTeamByMatch(bet.match_id, bet.team_id) ? 'Winner' : 'Lost')
                    : (bet.cancel_by === 'By Admin' ? 'Refund' : 'N/A');
    
                const dateBy = bet.cancel_by !== '' ? bet.cancel_date : bet.bet_date;
                // const dateBy2 = new Date(dateBy).getTime();
                // Set dateBy2 based on cancel_by condition
                const dateBy2 = bet.cancel_by ? moment(bet.cancel_date).tz("Asia/Kolkata").valueOf() : moment(bet.bet_date).tz("Asia/Kolkata").valueOf();
    
                try {
                    bet.match_time = JSON.parse(bet.match_time);
                } catch {
                    bet.match_time = [];
                }
    
                let matchingIndex = null;
    
                if (Array.isArray(bet.match_time) && bet.match_time.length > 0) {
                    const firstMatchTimeStamp = new Date(`${bet.match_date} ${bet.match_time[0]}`).getTime();
                    const lastMatchTimeStamp = new Date(`${bet.match_date} ${bet.match_time[bet.match_time.length - 1]}`).getTime();
    
                    if (dateBy2 < firstMatchTimeStamp || dateBy2 > lastMatchTimeStamp) {
                        bet.matchTimeStatus = '--';
                    } else {
                        for (let i = 0; i < bet.match_time.length; i++) {
                            const matchTimeStamp = new Date(`${bet.match_date} ${bet.match_time[i]}`).getTime();
                            if (dateBy2 <= matchTimeStamp) {
                                matchingIndex = i;
                                bet.matchTimeStatus = new Date(matchTimeStamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                break;
                            }
                        }
                    }
                } else {
                    bet.matchTimeStatus = '--';
                }
    
                try {
                    bet.win_ratio = JSON.parse(bet.win_ratio);
                } catch {
                    bet.win_ratio = [];
                }
    
                bet.winRatio = Array.isArray(bet.win_ratio)
                    ? (matchingIndex === null ? `${bet.win_ratio[0]}%` : `${bet.win_ratio[matchingIndex]}%`)
                    : '--';
            }));
    
            return res.status(200).send({
                status: true,
                data: betList,
                count: total_count,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(total_count / perPage),
                message: 'Betting order list fetched successfully',
            });
        } catch (error) {
            logger.error(`Error fetching betting order list: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching the betting order list',
                error: error.message,
            });
        }
    }
}

module.exports = new BetController();