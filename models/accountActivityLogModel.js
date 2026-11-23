const moment = require('moment-timezone');
const db = require('../config/database');
const { logger } = require('../logger');
const { clientIp, clientGeo, clientBrowser } = require('../helpers/clientInfo');

// Table from sql/20261125-account-activity-log.sql. The app keeps working while it has not been
// run yet: the log is just skipped.
let warnedMissingTable = false;

class AccountActivityLogModel {
    // One step of adding, deleting or changing the primary bank account.
    // Never throws and is not awaited by callers: a logging problem must never stop the action.
    static record(req, { userId, action, step, status = 'success', reason = null, acId = null, hint = null }) {
        if (!userId) return;

        (async () => {
            const geo = clientGeo(req);
            let state = geo.state;
            let stateSource = state ? 'cloudflare' : null;

            // Cloudflare sent no state: the state on the user's registration stands in for it.
            if (!state) {
                const [rows] = await db.promise().query('SELECT state FROM tbl_registration WHERE id = ? LIMIT 1', [userId]);
                if (rows.length && rows[0].state) {
                    state = String(rows[0].state).trim().slice(0, 100) || null;
                    stateSource = state ? 'profile' : null;
                }
            }

            await db.promise().query(
                `INSERT INTO tbl_account_activity_log
                 (user_id, action, step, status, fail_reason, ac_id, account_hint, ip_address,
                  country, state, state_source, city, browser, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    action,
                    step,
                    status,
                    reason ? String(reason).slice(0, 100) : null,
                    acId,
                    hint ? String(hint).slice(0, 100) : null,
                    clientIp(req),
                    geo.country,
                    state,
                    stateSource,
                    geo.city,
                    clientBrowser(req),
                    moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
                ]
            );
        })().catch((error) => {
            if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
                if (!warnedMissingTable) {
                    warnedMissingTable = true;
                    logger.warn('tbl_account_activity_log is missing or out of date; run sql/20261125-account-activity-log.sql');
                }
                return;
            }
            logger.error(`Could not write the account activity log: ${error.message}`);
        });
    }
}

module.exports = AccountActivityLogModel;
