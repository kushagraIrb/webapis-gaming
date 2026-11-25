const { AsyncLocalStorage } = require('async_hooks');
const sendMail = require('./sendMail');
const { logger } = require('../logger');

// One switch for every email OTP: EMAIL_OTP_ENABLED in the server .env.
//
//   true, or not set  every code and alert email is sent as usual.
//   false             nothing is emailed. The code is still created, stored and checked exactly as
//                     before, and the server puts it in the answer to the request that asked for it
//                     (as `devOtp`), so the screen can fill it in for the user.
//
// With the switch off, anyone who has a user's password is handed the code, so it works like turning
// OTP off. It covers the new-device login code, the bank account code, the registration code, the
// email-setup code, and the new-device and bank-account alert emails.
const isEmailOtpEnabled = () => String(process.env.EMAIL_OTP_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

const requestStore = new AsyncLocalStorage();

if (!isEmailOtpEnabled()) {
    logger.warn('EMAIL_OTP_ENABLED=false: no OTP emails are sent, and codes are returned to the screen (devOtp).');
}

const maskEmail = (email) => {
    const [name, domain] = String(email || '').split('@');
    return domain ? `${name.slice(0, 2)}***@${domain}` : '***';
};

// Express middleware for the routers that send codes. With the switch off it remembers, for this one
// request, the code that would have been emailed, and adds it to the JSON answer as `devOtp`.
const devOtpEcho = (req, res, next) => {
    if (isEmailOtpEnabled()) return next();

    const store = { code: null };
    const json = res.json.bind(res);
    res.json = (body) => {
        if (store.code && body && typeof body === 'object' && !Array.isArray(body)) {
            body = { ...body, devOtp: store.code };
        }
        return json(body);
    };
    return requestStore.run(store, next);
};

// Use this instead of sendMail for a code or alert email. `code` is the code inside the email, if any.
const deliverOtp = ({ kind, to, subject, html, code = null }) => {
    if (isEmailOtpEnabled()) {
        return sendMail(to, subject, html);
    }

    const store = requestStore.getStore();
    if (store && code !== null && code !== undefined) {
        store.code = String(code);
    }
    logger.info(`EMAIL_OTP_ENABLED=false: ${kind} email to ${maskEmail(to)} was not sent`);
    return Promise.resolve();
};

module.exports = { isEmailOtpEnabled, devOtpEcho, deliverOtp };
