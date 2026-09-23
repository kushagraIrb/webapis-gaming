const db = require('../config/database');

class BetModel {
    static getWinnerStatusExpression() {
        return `CASE
            WHEN bt.cancel_by = 'By Admin' THEN 'Refund'
            WHEN EXISTS (
                SELECT 1
                FROM tbl_winner winner_match
                WHERE winner_match.match_id = bt.match_id
            ) THEN CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM tbl_winner winner_team
                    WHERE winner_team.match_id = bt.match_id
                      AND winner_team.team_id = bt.team_id
                ) THEN 'Winner'
                ELSE 'Lost'
            END
            ELSE 'N/A'
        END`;
    }

    static buildFilters(userId, search = '', filters = {}) {
        const normalizedSearch = String(search || '').trim();
        const winnerStatus = String(filters.winnerStatus || '').trim();
        const status = String(filters.status || '').trim();
        const cancelBy = String(filters.cancelBy || '').trim();
        const allowedWinnerStatuses = ['Winner', 'Lost', 'Refund'];
        const allowedStatuses = ['live', 'cancelled'];
        const allowedCancelBy = ['By User', 'By Admin'];
        const where = ['bt.user_id = ?'];
        const params = [userId];

        if (normalizedSearch) {
            where.push('mt.match_name LIKE ?');
            params.push(`%${normalizedSearch}%`);
        }

        if (allowedStatuses.includes(status)) {
            where.push(status === 'live' ? 'bt.status = 1' : '(bt.status IS NULL OR bt.status <> 1)');
        }

        if (allowedCancelBy.includes(cancelBy)) {
            where.push('bt.cancel_by = ?');
            params.push(cancelBy);
        }

        if (allowedWinnerStatuses.includes(winnerStatus)) {
            where.push(`(${this.getWinnerStatusExpression()}) = ?`);
            params.push(winnerStatus);
        }

        return {
            where: where.join(' AND '),
            params,
        };
    }

    // Fetch total bet count
    static async getBetCount(userId, search = '', filters = {}) {
        try {
            const filterData = this.buildFilters(userId, search, filters);
            const query = `
                SELECT COUNT(*) as total_count
                FROM tbl_bet bt
                LEFT JOIN tbl_upcoming_match mt ON mt.id = bt.match_id
                LEFT JOIN tbl_team tm ON tm.id = bt.team_id
                LEFT JOIN tbl_toss_type ts ON ts.tid = bt.toss_id
                WHERE ${filterData.where}`;
            const [rows] = await db.promise().query(query, filterData.params);
            return rows[0];
        } catch (error) {
            console.error('Error fetching bet count:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Fetch bet list with pagination
    static async getBetList(userId, start, perPage, search = '', filters = {}) {
        try {
            const filterData = this.buildFilters(userId, search, filters);
            const query = `
                SELECT bt.bet_id, bt.match_id, bt.team_id, bt.bet_id, bt.cancel_date, bt.bet_date, bt.amount,
                       bt.cancel_by, bt.status, bt.wallet_amount, bt.bonus_amount,
                       mt.match_name, mt.match_date, mt.match_time, mt.win_ratio, mt.isLive,
                       mt.status as match_status, tm.team_name, ts.coin_type
                FROM tbl_bet bt
                LEFT JOIN tbl_upcoming_match mt ON mt.id = bt.match_id
                LEFT JOIN tbl_team tm ON tm.id = bt.team_id
                LEFT JOIN tbl_toss_type ts ON ts.tid = bt.toss_id
                WHERE ${filterData.where} ORDER BY bt.bet_id DESC
                LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [
                ...filterData.params,
                start,
                perPage,
            ]);
            return rows;
        } catch (error) {
            console.error('Error fetching bet list:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async getMyBets(userId, limit = 6) {
        try {
            const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 6);
            const query = `
                SELECT
                    bt.bet_id,
                    bt.match_id,
                    bt.team_id,
                    bt.amount,
                    bt.status,
                    bt.cancel_by,
                    bt.bet_date,
                    mt.encrypted_id,
                    mt.match_name,
                    mt.match_title,
                    mt.match_date,
                    mt.match_time,
                    mt.win_ratio,
                    tm.team_name,
                    tm.team_logo,
                    CASE
                        WHEN bt.status = 1
                            AND mt.status = 1
                            AND mt.cancel = 1
                            AND mt.isLive = 1
                            AND mt.id NOT IN (SELECT match_id FROM tbl_winner)
                            AND STR_TO_DATE(
                                CONCAT(
                                    mt.match_date, ' ',
                                    JSON_UNQUOTE(
                                        JSON_EXTRACT(
                                            mt.match_time,
                                            CONCAT('$[', JSON_LENGTH(mt.match_time) - 1, ']')
                                        )
                                    )
                                ),
                                '%Y-%m-%d %H:%i'
                            ) > CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')
                        THEN 1
                        ELSE 0
                    END AS is_live,
                    CASE
                        WHEN bt.cancel_by = 'By Admin' THEN 'refunded'
                        WHEN bt.status <> 1 OR mt.cancel <> 1 THEN 'cancelled'
                        WHEN EXISTS (
                            SELECT 1
                            FROM tbl_winner winner_match
                            WHERE winner_match.match_id = bt.match_id
                        ) THEN CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM tbl_winner winner_team
                                WHERE winner_team.match_id = bt.match_id
                                  AND winner_team.team_id = bt.team_id
                            ) THEN 'won'
                            ELSE 'lost'
                        END
                        WHEN mt.status = 1
                            AND mt.isLive = 1
                            AND STR_TO_DATE(
                                CONCAT(
                                    mt.match_date, ' ',
                                    JSON_UNQUOTE(
                                        JSON_EXTRACT(
                                            mt.match_time,
                                            CONCAT('$[', JSON_LENGTH(mt.match_time) - 1, ']')
                                        )
                                    )
                                ),
                                '%Y-%m-%d %H:%i'
                            ) > CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')
                        THEN 'active'
                        ELSE 'pending_result'
                    END AS result_status
                FROM tbl_bet bt
                LEFT JOIN tbl_upcoming_match mt ON mt.id = bt.match_id
                LEFT JOIN tbl_team tm ON tm.id = bt.team_id
                WHERE bt.user_id = ?
                ORDER BY is_live DESC, bt.bet_date DESC, bt.bet_id DESC
                LIMIT ?`;

            const [rows] = await db.promise().query(query, [userId, safeLimit]);
            return rows;
        } catch (error) {
            console.error('Error fetching my bets:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async isMatchWinnerAnnounced(matchId) {
        try {
            // Query to check if winners exist for the given match_id
            const query = `SELECT wid FROM tbl_winner WHERE match_id = ?`;
            const [rows] = await db.promise().query(query, [matchId]);
    
            return rows;
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced model:', error.message);
            throw new Error('Failed to fetch match winner details.');
        }
    }

    static async winnerTeamByMatch(matchId, teamId) {
        try {
            // Query to check the winner team
            const query = `SELECT wid FROM tbl_winner WHERE match_id = ? AND team_id = ?`;
            const [rows] = await db.promise().query(query, [matchId, teamId]);
    
            return rows;
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced model:', error.message);
            throw new Error('Failed to fetch match winner details.');
        }
    }
}

module.exports = BetModel;
