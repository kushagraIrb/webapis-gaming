const moment = require('moment-timezone');
const db = require('../config/database');
const { logger } = require('../logger');
const { clientIp, clientGeo, clientBrowser } = require('../helpers/clientInfo');

// Table from sql/20261123-auth-activity-log.sql plus sql/20261124-auth-activity-log-failed-logins.sql.
// The app keeps working while either file has not been run yet: the log is just skipped.
let warnedMissingTable = false;

// A wrong-password attack must not be able to fill the table: at most this many failed-login
// rows are written per IP address in the window (counted in each worker's memory).
const FAILED_ROWS_PER_IP = 20;
const FAILED_WINDOW_MS = 10 * 60 * 1000;
const failedCounters = new Map();

function failedLogAllowed(ip) {
    const now = Date.now();
    if (failedCounters.size > 5000) {
        for (const [key, entry] of failedCounters) {
            if (entry.resetAt <= now) failedCounters.delete(key);
        }
    }
    const key = ip || 'unknown';
    const entry = failedCounters.get(key);
    if (!entry || entry.resetAt <= now) {
        failedCounters.set(key, { count: 1, resetAt: now + FAILED_WINDOW_MS });
        return true;
    }
    entry.count += 1;
    return entry.count <= FAILED_ROWS_PER_IP;
}

class AuthLogModel {
    // A successful login or signup, or (eventType 'profile_update') a change to the user's own profile.
    static record(req, { userId, eventType, method = 'password', details = null }) {
        if (!userId) return;
        this.write(req, { userId, eventType, method, status: 'success', details });
    }

    // A failed login. phone is what was typed on a password login; the user is looked up from it.
    // eventType / details let another kind of event (for example a bank account change) record a failure too.
    static recordFailure(req, { method = 'password', reason, phone = null, userId = null, eventType = 'login', details = null }) {
        if (!failedLogAllowed(clientIp(req))) return;
        this.write(req, { userId, eventType, method, status: 'failed', reason, phone, details });
    }

    // Never throws and is not awaited by callers: a logging problem must never stop a login.
    static write(req, { userId = null, eventType, method, status, reason = null, phone = null, details = null }) {
        (async () => {
            const geo = clientGeo(req);
            let state = geo.state;
            let stateSource = state ? 'cloudflare' : null;
            let uid = userId;
            const phoneText = phone ? String(phone).trim().slice(0, 20) : null;

            // Cloudflare did not send a state, or the user is only known by phone: look at the
            // registration. The state typed or derived at signup stands in for the missing one.
            if ((!uid && phoneText) || !state) {
                const [rows] = uid
                    ? await db.promise().query('SELECT id, state FROM tbl_registration WHERE id = ? LIMIT 1', [uid])
                    : phoneText
                        ? await db.promise().query('SELECT id, state FROM tbl_registration WHERE phone = ? LIMIT 1', [phoneText])
                        : [[]];
                if (rows.length) {
                    uid = uid || rows[0].id;
                    if (!state && rows[0].state) {
                        state = String(rows[0].state).trim().slice(0, 100) || null;
                        stateSource = state ? 'profile' : null;
                    }
                }
            }

            await db.promise().query(
                `INSERT INTO tbl_auth_activity_log
                 (user_id, event_type, status, fail_reason, phone_entered, auth_method, details, ip_address,
                  country, state, state_source, city, browser, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uid,
                    eventType,
                    status,
                    reason ? String(reason).slice(0, 100) : null,
                    status === 'failed' ? phoneText : null,
                    method,
                    details ? String(details).slice(0, 255) : null,
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
                    logger.warn('tbl_auth_activity_log is missing or out of date; run the sql/*auth-activity-log*.sql files');
                }
                return;
            }
            logger.error(`Could not write the auth activity log: ${error.message}`);
        });
    }
}

module.exports = AuthLogModel;
