const crypto = require('crypto');
const requestIp = require('request-ip');
const trustedDeviceModel = require('../models/trustedDeviceModel');
const userModel = require('../models/userModel');
const totpModel = require('../models/totpModel');
const sendMail = require('../helpers/sendMail');
const browserName = require('../helpers/browserName');
const { logger } = require('../logger');

// New-device login check. A password or Google login from a browser the account has not
// passed the email OTP on does not get a session. It gets a pending "challenge"; the session
// is only issued after the OTP is entered, and that browser is then trusted for good.
//
// Switched on with NEW_DEVICE_OTP_ENABLED=true (needs sql/20261123-new-device-login-otp.sql).
// With it off, nothing here changes how login works.

const OTP_VALID_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 3;
const RESEND_GAP_SECONDS = 60;
const HEX_64 = /^[a-f0-9]{64}$/;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const fail = (message, statusCode, extra = {}) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    Object.assign(err, extra);
    return err;
};

const expiredError = (message = 'This verification has expired. Please log in again.') =>
    fail(message, 400, { restartLogin: true });

class DeviceTrustService {
    static isEnabled() {
        return String(process.env.NEW_DEVICE_OTP_ENABLED || '').toLowerCase() === 'true';
    }

    static requestContext(req) {
        return {
            ip: (requestIp.getClientIp(req) || '').replace(/^::ffff:/, '').slice(0, 45),
            browser: String(req.headers['user-agent'] || '').slice(0, 255),
        };
    }

    // The browser sends the device id it was given after its last OTP. Only the hash is stored.
    static deviceHashFromRequest(req) {
        const raw = String(req.headers['x-device-id'] || '').trim().toLowerCase();
        return HEX_64.test(raw) ? sha256(raw) : null;
    }

    static maskEmail(email) {
        const [name, domain] = String(email).split('@');
        if (!domain) return '***';
        return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}`;
    }

    static otpHash(challengeId, otp) {
        return crypto.createHmac('sha256', String(process.env.JWT_SECRET)).update(`${challengeId}:${otp}`).digest('hex');
    }

    // Call after the password (or Google credential) has been accepted and the account checked.
    // Returns { trusted: true } to carry on with the normal login, or a pending challenge.
    static async gate(user, req, method) {
        if (!this.isEnabled()) {
            return { trusted: true };
        }

        const deviceHash = this.deviceHashFromRequest(req);
        if (deviceHash && await trustedDeviceModel.isTrusted(user.id, deviceHash)) {
            return { trusted: true };
        }

        const email = String(user.email || '').trim();
        if (!email) {
            throw fail('We could not find an email on your account to verify this device. Please contact support.', 403);
        }

        const challengeId = crypto.randomBytes(32).toString('hex');
        const otp = String(crypto.randomInt(100000, 1000000));
        const ctx = this.requestContext(req);

        // A user with Google Authenticator turned on enters the code from the app: nothing is mailed.
        if (await totpModel.isEnabled(user.id)) {
            await trustedDeviceModel.createChallenge({
                challengeHash: sha256(challengeId),
                userId: user.id,
                method,
                otpHash: this.otpHash(challengeId, otp), // never used; the column is required
                ipAddress: ctx.ip,
                browser: ctx.browser,
                validMinutes: OTP_VALID_MINUTES,
                secondFactor: 'totp',
            });
            return { trusted: false, challengeId, maskedEmail: this.maskEmail(email), method: 'totp' };
        }

        await trustedDeviceModel.createChallenge({
            challengeHash: sha256(challengeId),
            userId: user.id,
            method,
            otpHash: this.otpHash(challengeId, otp),
            ipAddress: ctx.ip,
            browser: ctx.browser,
            validMinutes: OTP_VALID_MINUTES,
        });

        this.sendCodeMail(email, user.first_name, otp, ctx);

        return { trusted: false, challengeId, maskedEmail: this.maskEmail(email), method: 'email' };
    }

    static async verify(challengeId, otp, req) {
        // 6 digits (mailed code or Authenticator app), or a backup code (10 hex characters).
        const otpText = String(otp || '').trim();
        const looksRight = /^\d{6}$/.test(otpText) || /^[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}$/.test(otpText);
        if (!HEX_64.test(String(challengeId || '')) || !looksRight) {
            throw fail('Please enter the 6-digit code.', 400);
        }

        const challenge = await trustedDeviceModel.getChallenge(sha256(challengeId));
        // A code issued for a bank account change must never log anyone in (purpose column is
        // missing until sql/20261125-account-otp-challenge-columns.sql runs: that means 'login').
        if (!challenge || challenge.used_at || !challenge.is_live || challenge.attempts >= OTP_MAX_ATTEMPTS
            || (challenge.purpose || 'login') !== 'login') {
            throw expiredError();
        }

        // The guess is counted first and atomically: checking the count and adding to it as two
        // steps would let a burst of parallel requests try far more than OTP_MAX_ATTEMPTS codes.
        const used = await trustedDeviceModel.reserveAttempt(challenge.id, OTP_MAX_ATTEMPTS);
        if (used === null) {
            throw expiredError();
        }

        // Right if it matches the mailed code, or (Authenticator) the app's current code or an
        // unused backup code. The guess was already counted above either way.
        let codeOk;
        if (challenge.second_factor === 'totp') {
            codeOk = await require('./totpService').verifyAny(challenge.user_id, otpText);
        } else {
            const expected = Buffer.from(challenge.otp_hash, 'hex');
            const given = Buffer.from(this.otpHash(challengeId, otpText), 'hex');
            codeOk = expected.length === given.length && crypto.timingSafeEqual(expected, given);
        }
        if (!codeOk) {
            const left = OTP_MAX_ATTEMPTS - used;
            if (left <= 0) {
                throw Object.assign(expiredError('Too many wrong codes. Please log in again.'), { userId: challenge.user_id });
            }
            throw fail(`Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`, 400, { userId: challenge.user_id });
        }

        if (!(await trustedDeviceModel.consume(challenge.id))) {
            throw expiredError();
        }

        const [user] = await userModel.findUserById(challenge.user_id);
        if (!user || user.is_verified !== 1 || user.status !== 1 || user.ip_status !== 1) {
            throw fail('Your login Id is blocked, please contact the administrator.', 403);
        }

        const ctx = this.requestContext(req);
        const deviceId = crypto.randomBytes(32).toString('hex');
        await trustedDeviceModel.addTrusted(user.id, sha256(deviceId), ctx.browser, ctx.ip);

        this.sendNewDeviceAlert(user, ctx);

        return { user, deviceId, method: challenge.auth_method };
    }

    static async resend(challengeId) {
        if (!HEX_64.test(String(challengeId || ''))) {
            throw expiredError();
        }

        const challenge = await trustedDeviceModel.getChallenge(sha256(challengeId));
        if (!challenge || challenge.used_at || !challenge.is_live || (challenge.purpose || 'login') !== 'login') {
            throw expiredError();
        }
        if (challenge.second_factor === 'totp') {
            throw fail('The code is in your Authenticator app. There is nothing to resend.', 400);
        }
        if (challenge.resend_count >= OTP_MAX_RESENDS) {
            throw expiredError('Too many codes requested. Please log in again.');
        }
        const wait = RESEND_GAP_SECONDS - challenge.seconds_since_sent;
        if (wait > 0) {
            throw fail(`Please wait ${wait} seconds before asking for a new code.`, 429);
        }

        const [user] = await userModel.findUserById(challenge.user_id);
        const email = String((user && user.email) || '').trim();
        if (!email) {
            throw expiredError();
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        await trustedDeviceModel.replaceOtp(challenge.id, this.otpHash(challengeId, otp), OTP_VALID_MINUTES);
        this.sendCodeMail(email, user.first_name, otp, { ip: challenge.ip_address, browser: challenge.browser });

        return { maskedEmail: this.maskEmail(email) };
    }

    // A person who has just registered is on a device they have just proved they hold.
    static async trustNewDevice(userId, req) {
        if (!this.isEnabled()) {
            return null;
        }
        const ctx = this.requestContext(req);
        const deviceId = crypto.randomBytes(32).toString('hex');
        await trustedDeviceModel.addTrusted(userId, sha256(deviceId), ctx.browser, ctx.ip);
        return deviceId;
    }

    // Password changed by the user's own reset link or by an admin: nothing stays trusted.
    static async clearAllForUser(userId) {
        await this.quietly(() => trustedDeviceModel.deleteAllForUser(userId), userId);
    }

    // Password changed by the logged-in user: their current browser stays trusted, the rest do not.
    static async clearOthersForUser(userId, req) {
        const keepHash = this.deviceHashFromRequest(req);
        if (!keepHash) {
            return this.clearAllForUser(userId);
        }
        await this.quietly(() => trustedDeviceModel.deleteAllExcept(userId, keepHash), userId);
    }

    // A failure here must not turn a successful password change into an error. A missing
    // table just means the migration has not been run yet.
    static async quietly(action, userId) {
        try {
            await action();
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                logger.error(`Could not clear trusted devices for user ${userId}: ${error.message}`);
            }
        }
    }

    static sendCodeMail(email, firstName, otp, ctx) {
        const content = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; text-align: center;">
                <h2>Gaming Helper Online</h2>
                <p>Hello ${escapeHtml(firstName || 'there')},</p>
                <p>We noticed a login from a browser or device we do not recognise. Enter this code to continue:</p>
                <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;">${otp}</p>
                <p>This code is valid for ${OTP_VALID_MINUTES} minutes. Never share it with anyone.</p>
                <p style="color: #666; font-size: 13px;">IP address: ${escapeHtml(ctx.ip || 'Unknown')}<br>Browser: ${escapeHtml(browserName(ctx.browser))}</p>
                <p style="color: #666; font-size: 13px;">If this was not you, do not enter the code and change your password.</p>
            </div>`;
        Promise.resolve(sendMail(email, 'Gaming Helper Online - Login verification code', content))
            .catch((error) => logger.error(`Login OTP email could not be sent: ${error.message}`));
    }

    static sendNewDeviceAlert(user, ctx) {
        const email = String(user.email || '').trim();
        if (!email) return;
        const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const content = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Gaming Helper Online</h2>
                <p>Hello ${escapeHtml(user.first_name || 'there')},</p>
                <p>Your account was just logged in from a new device.</p>
                <p style="color: #444;">Time: ${escapeHtml(when)} (IST)<br>IP address: ${escapeHtml(ctx.ip || 'Unknown')}<br>Browser: ${escapeHtml(browserName(ctx.browser))}</p>
                <p>If this was you, no action is needed. If not, change your password immediately and contact support.</p>
            </div>`;
        Promise.resolve(sendMail(email, 'New device login on your Gaming Helper account', content))
            .catch((error) => logger.error(`New device alert email could not be sent: ${error.message}`));
    }
}

// Shared with the bank account OTP (services/accountOtpService.js) so both use the same rules.
DeviceTrustService.shared = {
    OTP_VALID_MINUTES, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, RESEND_GAP_SECONDS, HEX_64,
    sha256, escapeHtml, fail,
};

module.exports = DeviceTrustService;
