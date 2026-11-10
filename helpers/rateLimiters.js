const rateLimit = require('express-rate-limit');
const requestIp = require('request-ip');

/*
| Rate limits for the endpoints an attacker would hammer: login, OTP, password reset, signup.
|
| - Counters live in each worker's memory, so with several cluster workers the real ceiling is
|   a few times the number written here. That still turns "unlimited" into "bounded".
| - The client IP comes from request-ip, the same way the rest of the app finds it.
| - Per-account limits (key = IP + phone/email) stop a guessing attack on one account without
|   locking out everyone behind the same shared mobile IP; a looser per-IP limit sits on top.
| - Set RATE_LIMIT_DISABLED=true only for local automated tests; it is never needed in production.
*/

const disabled = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
const clientIp = (req) => requestIp.getClientIp(req) || 'unknown';
const field = (value) => String(value ?? '').toLowerCase().slice(0, 64);

const make = ({ windowMinutes, max, key, message }) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => disabled,
        keyGenerator: key,
        validate: { xForwardedForHeader: false, trustProxy: false },
        handler: (req, res) => res.status(429).json({ msg: message || 'Too many attempts. Please wait a while and try again.' }),
    });

module.exports = {
    // One account: 10 attempts per 15 minutes.
    loginPerAccount: make({ windowMinutes: 15, max: 10, key: (req) => `login:${clientIp(req)}:${field(req.body && req.body.phone)}` }),
    // One IP across all accounts: 200 per 15 minutes.
    loginPerIp: make({ windowMinutes: 15, max: 200, key: (req) => `login-ip:${clientIp(req)}` }),
    // Sending OTP emails: 5 per 15 minutes per email address, 30 per IP.
    otpPerTarget: make({ windowMinutes: 15, max: 5, key: (req) => `otp:${clientIp(req)}:${field(req.body && req.body.email)}`, message: 'Too many verification codes requested. Please wait and try again.' }),
    otpPerIp: make({ windowMinutes: 15, max: 30, key: (req) => `otp-ip:${clientIp(req)}` }),
    // Signup (it checks the OTP): 10 attempts per 15 minutes per email, 60 per IP per hour.
    registerPerTarget: make({ windowMinutes: 15, max: 10, key: (req) => `register:${clientIp(req)}:${field(req.body && req.body.email)}` }),
    registerPerIp: make({ windowMinutes: 60, max: 60, key: (req) => `register-ip:${clientIp(req)}` }),
    // Password reset requests and submissions: 10 per hour per IP.
    passwordReset: make({ windowMinutes: 60, max: 10, key: (req) => `reset:${clientIp(req)}` }),
    // Token refresh: 100 per 15 minutes per IP.
    tokenRefresh: make({ windowMinutes: 15, max: 100, key: (req) => `refresh:${clientIp(req)}` }),
};
