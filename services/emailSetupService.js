const crypto = require('crypto');
const userModel = require('../models/userModel');
const emailVerifyModel = require('../models/emailVerifyModel');
const DeviceTrust = require('./deviceTrustService');
const sendMail = require('../helpers/sendMail');
const { clientIp } = require('../helpers/clientInfo');
const { logger } = require('../logger');

// A user with no email on the account must add one and prove it with a code mailed to it before they
// can log in, change their bank accounts or withdraw. The code goes to the NEW address, is 6 digits,
// valid 10 minutes, 5 guesses (counted atomically), 3 resends 60 seconds apart, single use, and the
// email is only saved after the right code. Every change is written to tbl_user_email_log.
//
// Switched on with EMAIL_REQUIRED_ENABLED=true (needs sql/20261127-email-required.sql). Off = nothing here
// changes how anything works.

const { OTP_VALID_MINUTES, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, RESEND_GAP_SECONDS, sha256, escapeHtml, fail } = DeviceTrust.shared;
const MAX_SENDS_PER_HOUR = 5;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const expired = (message = 'This verification has expired. Please start again.') =>
    fail(message, 400, { restartEmailSetup: true });

class EmailSetupService {
    static isEnabled() {
        return String(process.env.EMAIL_REQUIRED_ENABLED || '').toLowerCase() === 'true';
    }

    static hasEmail(user) {
        return !!String((user && user.email) || '').trim();
    }

    // Used by the bank account and withdrawal routes: with the feature on, no email = no action.
    static async assertHasEmail(userId) {
        if (!this.isEnabled()) return;
        const [user] = await userModel.findUserById(userId);
        if (!user) throw fail('User not found.', 404);
        if (!this.hasEmail(user)) {
            throw fail('Please add and verify your email address first.', 403, { emailRequired: true });
        }
    }

    static normalize(email) {
        const text = String(email || '').trim().toLowerCase();
        if (text.length > 255 || !EMAIL_FORMAT.test(text)) {
            throw fail('Please enter a valid email address.', 400);
        }
        return text;
    }

    static otpHash(key, otp) {
        return crypto.createHmac('sha256', String(process.env.JWT_SECRET)).update(`emailsetup:${key}:${otp}`).digest('hex');
    }

    // key = what identifies one attempt: a random id for a logged-in user, the login challenge for a login.

    static async start(userId, key, rawEmail, req) {
        const email = this.normalize(rawEmail);
        const [user] = await userModel.findUserById(userId);
        if (!user) throw fail('User not found.', 404);
        if (this.hasEmail(user)) throw fail('Your account already has an email address.', 400);

        const holders = await userModel.findUserByEmail(email);
        if (holders.some((u) => Number(u.id) !== Number(userId))) {
            throw fail('This email is already used by another account. Please use a different one.', 409);
        }
        if ((await emailVerifyModel.sentLastHour(userId)) >= MAX_SENDS_PER_HOUR) {
            throw fail('Too many codes requested. Please try again after an hour.', 429);
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        await emailVerifyModel.create({
            verifyHash: sha256(key), userId, newEmail: email, otpHash: this.otpHash(key, otp), validMinutes: OTP_VALID_MINUTES,
        });
        this.sendCodeMail(email, user.first_name, otp, clientIp(req));
        return { maskedEmail: DeviceTrust.maskEmail(email) };
    }

    static async resend(userId, key, req) {
        const row = await emailVerifyModel.get(sha256(key));
        if (!row || Number(row.user_id) !== Number(userId) || row.used_at || !row.is_live) throw expired();
        if (row.resend_count >= OTP_MAX_RESENDS) throw expired('Too many codes requested. Please start again.');
        const wait = RESEND_GAP_SECONDS - row.seconds_since_sent;
        if (wait > 0) throw fail(`Please wait ${wait} seconds before asking for a new code.`, 429);

        const [user] = await userModel.findUserById(userId);
        const otp = String(crypto.randomInt(100000, 1000000));
        await emailVerifyModel.replaceOtp(row.id, this.otpHash(key, otp), OTP_VALID_MINUTES);
        this.sendCodeMail(row.new_email, user && user.first_name, otp, clientIp(req));
        return { maskedEmail: DeviceTrust.maskEmail(row.new_email) };
    }

    // Checks the code and saves the email. Returns the saved address.
    static async confirm(userId, key, otp, req) {
        if (!/^\d{6}$/.test(String(otp || '').trim())) throw fail('Please enter the 6-digit code.', 400);
        const row = await emailVerifyModel.get(sha256(key));
        if (!row || Number(row.user_id) !== Number(userId) || row.used_at || !row.is_live) throw expired();

        const used = await emailVerifyModel.reserveAttempt(row.id, OTP_MAX_ATTEMPTS);
        if (used === null) throw expired('Too many wrong codes. Please start again.');

        const expected = Buffer.from(row.otp_hash, 'hex');
        const given = Buffer.from(this.otpHash(key, String(otp).trim()), 'hex');
        if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
            const left = OTP_MAX_ATTEMPTS - used;
            if (left <= 0) throw expired('Too many wrong codes. Please start again.');
            throw fail(`Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`, 400, { userId });
        }
        if (!(await emailVerifyModel.consume(row.id))) throw expired();

        if (!(await emailVerifyModel.setEmailIfEmpty(userId, row.new_email))) {
            throw fail('This email could not be saved. It may already be used by another account.', 409);
        }
        await emailVerifyModel.logChange({ userId, oldEmail: null, newEmail: row.new_email, changedBy: 'user', ip: clientIp(req) });
        return row.new_email;
    }

    static sendCodeMail(email, firstName, otp, ip) {
        const content = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; text-align: center;">
                <h2>Gaming Helper Online</h2>
                <p>Hello ${escapeHtml(firstName || 'there')},</p>
                <p>Enter this code to verify your email address:</p>
                <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;">${otp}</p>
                <p>This code is valid for ${OTP_VALID_MINUTES} minutes. Never share it with anyone.</p>
                <p style="color: #666; font-size: 13px;">IP address: ${escapeHtml(ip || 'Unknown')}</p>
                <p style="color: #666; font-size: 13px;">If you did not ask for this, ignore this email.</p>
            </div>`;
        Promise.resolve(sendMail(email, 'Gaming Helper Online - Verify your email', content))
            .catch((error) => logger.error(`Email verification mail could not be sent: ${error.message}`));
    }
}

module.exports = EmailSetupService;
