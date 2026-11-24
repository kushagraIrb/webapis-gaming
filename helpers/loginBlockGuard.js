const moment = require('moment-timezone');
const LoginBlock = require('../services/loginBlockService');

// Whole-site part of the login block: a blocked IP gets HTTP 429 on every request except the public pages
// that app.js leaves out. A phone block is not checked here; it only stops that phone logging in.
//
// Each worker remembers the answer for an IP for 3 seconds, so this is not a database query per request;
// an admin's unblock therefore takes effect within about 3 seconds.
const CACHE_MS = 3000;
const MAX_CACHED = 5000;
const cache = new Map();

const stillActive = (block) =>
    moment.tz(block.blocked_until, 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata').valueOf() > Date.now();

async function blockedIpGuard(req, res, next) {
    try {
        const ip = LoginBlock.trustedIp(req);
        if (!ip) return next();

        const now = Date.now();
        let entry = cache.get(ip);
        if (!entry || entry.expires <= now) {
            if (cache.size > MAX_CACHED) cache.clear();
            entry = { block: await LoginBlock.checkIp(ip), expires: now + CACHE_MS };
            cache.set(ip, entry);
        }

        if (entry.block && stillActive(entry.block)) {
            return res.status(429).json(LoginBlock.body(LoginBlock.describe(entry.block)));
        }
        return next();
    } catch (error) {
        // Never lock everyone out because of a fault here.
        return next();
    }
}

// Called when a block is created, so this worker stops answering "not blocked" from its cache at once.
const forget = (ip) => cache.delete(ip);

module.exports = { blockedIpGuard, forget };
