const betListModel = require('../models/betListModel');

class BetService {
    static getJsonArray(value) {
        if (Array.isArray(value)) return value;

        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    static getOddsAtBetTime(bet) {
        const matchTimes = this.getJsonArray(bet.match_time);
        const ratios = this.getJsonArray(bet.win_ratio);
        const betTimestamp = new Date(bet.bet_date).getTime();
        const matchDate = new Date(bet.match_date);

        if (!ratios.length || Number.isNaN(betTimestamp) || Number.isNaN(matchDate.getTime())) {
            return null;
        }

        const matchIndex = matchTimes.findIndex((matchTime) => {
            const [hours, minutes] = String(matchTime).split(':').map(Number);
            const matchTimestamp = Date.UTC(
                matchDate.getUTCFullYear(),
                matchDate.getUTCMonth(),
                matchDate.getUTCDate(),
                hours,
                minutes,
            );

            return betTimestamp < matchTimestamp;
        });

        const ratio = Number(ratios[matchIndex === -1 ? 0 : matchIndex]);
        return Number.isFinite(ratio) ? ratio : null;
    }

    static async fetchMyBets(userId, limit = 5) {
        const bets = await betListModel.getMyBets(userId, limit);

        return bets.map((bet) => {
            const amount = Number(bet.amount) || 0;
            const odds = this.getOddsAtBetTime(bet);
            const possibleReturn =
                bet.status === 1 && odds !== null
                    ? Number((amount + (amount * odds) / 100).toFixed(2))
                    : null;

            return {
                bet_id: bet.bet_id,
                match_id: bet.match_id,
                encrypted_id: bet.encrypted_id,
                match_name: bet.match_name,
                match_title: bet.match_title,
                team_name: bet.team_name,
                team_logo: bet.team_logo,
                match_date: bet.match_date,
                match_time: this.getJsonArray(bet.match_time),
                bet_date: bet.bet_date,
                amount,
                odds,
                possible_return: possibleReturn,
                status: bet.status === 1 ? 'live' : 'cancelled',
                result_status: bet.result_status || (bet.status === 1 ? 'active' : 'cancelled'),
                is_live: Number(bet.is_live) === 1,
            };
        });
    }

    // Fetch bet list or count
    static async fetchBettingOrderList(userId, page, perPage, search = '', filters = {}) {
        try {
            const start = (page - 1) * perPage; // Calculate offset for pagination
            
            // Fetch total count
            const totalCount = await betListModel.getBetCount(userId, search, filters);

            // Fetch paginated bet list
            const betList = await betListModel.getBetList(
                userId,
                start,
                perPage,
                search,
                filters
            );

            return { total_count: totalCount.total_count, betList };
        } catch (error) {
            console.error('Error in BetService:', error.message);
            throw new Error('Failed to fetch betting order list');
        }
    }

    static async isMatchWinnerAnnounced(matchId) {
        try {
            const result = await betListModel.isMatchWinnerAnnounced(matchId);
            return result.length > 0 ? result : null; // Check if results exist
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced service:', error.message);
            throw new Error('Failed to check if match winner is announced.');
        }
    }

    static async winnerTeamByMatch(matchId, teamId) {
        try {
            const result = await betListModel.winnerTeamByMatch(matchId, teamId);
            return result.length > 0 ? result : null; // Check if results exist
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced service:', error.message);
            throw new Error('Failed to check if match winner is announced.');
        }
    }
}

module.exports = BetService;
