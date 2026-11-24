const moment = require('moment-timezone');
const loginBlockModel = require('../models/loginBlockModel');
const { trustedClientIp } = require('../helpers/trustedIp');
const { logger } = require('../logger');

// The login block. 3 wrong-password or unknown-phone logins from one IP within 5 minutes block that IP (the
// whole site) and every existing phone number tried from it, for 1 hour. An admin can unblock early. The
// numbers are fixed here on purpose: there is no switch for them in the .env.
//
// Two safety rules:
//   * An IP is only counted and blocked when it cannot have been faked (helpers/trustedIp.js). Otherwise
//     anyone could make us block somebody else's address, and behind Cloudflare every visitor would look alike.
//   * If the database fails while checking, the login goes ahead: a fault here must never lock everyone out.
const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 5;
const BLOCK_MINUTES = 60;

let warnedUntrusted = false;

function describe(block) {
    const until = moment.tz(block.blocked_until || block.blockedUntil, 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata');
    const secondsLeft = Math.max(1, Math.ceil((until.valueOf() - Date.now()) / 1000));
    return {
        blockedUntil: until.format('YYYY-MM-DD HH:mm:ss'),
        until: until.format('hh:mm A'),
        retryAfterSeconds: secondsLeft,
        scope: block.block_type || 'ip',
    };
}

class LoginBlockService {
    // The reply for a blocked visitor (HTTP 429).
    static body(info) {
        return {
            msg: `Too many failed login attempts. Access is blocked for 1 hour, until ${info.until} IST.`,
            blocked: true,
            blockedUntil: info.blockedUntil,
            retryAfterSeconds: info.retryAfterSeconds,
        };
    }

    // The visitor's IP when it can be trusted, else null.
    static trustedIp(req) {
        const { ip, trusted } = trustedClientIp(req);
        if (trusted && ip) return ip;
        if (!warnedUntrusted) {
            warnedUntrusted = true;
            logger.warn('Login block: the visitor IP could not be established for sure, so it is not used. Check the proxy sets X-Real-IP.');
        }
        return null;
    }

    // Is this visitor (IP) or this phone blocked right now? Returns the details, or null.
    static async check(req, phone = null) {
        try {
            const block = await loginBlockModel.findActive(this.trustedIp(req), phone ? String(phone).trim() : null);
            return block ? describe(block) : null;
        } catch (error) {
            this.failOpen(error);
            return null;
        }
    }

    // Is this IP blocked right now? (The whole-site check; the IP must already be a trusted one.)
    static async checkIp(ip) {
        try {
            return await loginBlockModel.findActive(ip, null);
        } catch (error) {
            this.failOpen(error);
            return null;
        }
    }

    // Call right AFTER a counted failed attempt was written to the activity log. Blocks the IP and the phones
    // when this was the last attempt allowed, and returns the details; otherwise null.
    static async afterFailedAttempt(req) {
        try {
            const ip = this.trustedIp(req);
            if (!ip) return null;

            const since = await loginBlockModel.countStart(ip, WINDOW_MINUTES);
            const { count, phones } = await loginBlockModel.recentFailures(ip, since);
            if (count < MAX_ATTEMPTS) return null;

            const accounts = await loginBlockModel.accountsForPhones(phones);
            const untilText = loginBlockModel.minutesFromNow(BLOCK_MINUTES);
            await loginBlockModel.createBlock({ ip, accounts, failedCount: Math.min(count, 255), untilText });
            require('../helpers/loginBlockGuard').forget(ip); // loaded here to avoid a circular require
            return describe({ block_type: 'ip', blocked_until: untilText });
        } catch (error) {
            this.failOpen(error);
            return null;
        }
    }

    static failOpen(error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            logger.warn('tbl_login_block is missing; run sql/20261128-login-block.sql. The login block is off until then.');
            return;
        }
        logger.error(`Login block check failed, letting the request through: ${error.message}`);
    }
}

LoginBlockService.COUNTED_REASONS = loginBlockModel.COUNTED_REASONS;
LoginBlockService.describe = describe;
LoginBlockService.MAX_ATTEMPTS = MAX_ATTEMPTS;
LoginBlockService.WINDOW_MINUTES = WINDOW_MINUTES;
LoginBlockService.BLOCK_MINUTES = BLOCK_MINUTES;
module.exports = LoginBlockService;
