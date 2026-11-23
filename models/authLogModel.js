const moment = require('moment-timezone');
const db = require('../config/database');
const { logger } = require('../logger');
const { clientIp, clientGeo, clientBrowser } = require('../helpers/clientInfo');

// Table from sql/20261123-auth-activity-log.sql.
let warnedMissingTable = false;

class AuthLogModel {
    // Records one successful login or signup. Never throws and is not awaited by callers:
    // a logging problem must never stop a login.
    static record(req, { userId, eventType, method = 'password' }) {
        if (!userId) return;

        const geo = clientGeo(req);
        db.promise()
            .query(
                `INSERT INTO tbl_auth_activity_log
                 (user_id, event_type, auth_method, ip_address, country, state, city, browser, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    eventType,
                    method,
                    clientIp(req),
                    geo.country,
                    geo.state,
                    geo.city,
                    clientBrowser(req),
                    moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
                ]
            )
            .catch((error) => {
                if (error.code === 'ER_NO_SUCH_TABLE') {
                    if (!warnedMissingTable) {
                        warnedMissingTable = true;
                        logger.warn('tbl_auth_activity_log does not exist yet; run sql/20261123-auth-activity-log.sql');
                    }
                    return;
                }
                logger.error(`Could not write the auth activity log: ${error.message}`);
            });
    }
}

module.exports = AuthLogModel;
