const crypto = require('crypto');
const userModel = require('../models/userModel');
const accountHistoryModel = require('../models/accountHistoryModel');
const accountOtpCodeModel = require('../models/accountOtpCodeModel');
const authLog = require('../models/authLogModel');
const DeviceTrust = require('./deviceTrustService');
const sendMail = require('../helpers/sendMail');
const browserName = require('../helpers/browserName');
const { clientIp, clientBrowser } = require('../helpers/clientInfo');
const { logger } = require('../logger');

// Email OTP for adding a bank account, deleting one and changing the primary one. The rules are the
// same as the new-device login (6 digits, 10 minutes, 5 guesses counted atomically, 3 resends 60
// seconds apart, single use), and it asks every time, trusted browser or not.
//
// The code is kept in otp_verified, exactly as it was emailed (not hashed), so it can be read in the
// table and checked by hand. It is tied to the logged-in user, to one purpose, and to the exact details
// it was sent for, so it cannot be used for a different change. What happens is written to
// tbl_auth_activity_log (IP address, location and browser are filled in as for a login).
//
// Switched on with ACCOUNT_OTP_ENABLED=true (needs sql/20261126-otp-verified-account-columns.sql).
// With it off nothing here changes how accounts work.

const { OTP_VALID_MINUTES, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, RESEND_GAP_SECONDS, escapeHtml, fail } = DeviceTrust.shared;

const PURPOSES = { ADD: 'add_account', DELETE: 'delete_account', PRIMARY: 'set_primary' };

const TEXT = {
    [PURPOSES.ADD]: { ask: 'add a bank account', done: 'A bank account was added to your account.', short: 'bank account add', logged: 'bank account added' },
    [PURPOSES.DELETE]: { ask: 'remove a bank account', done: 'A bank account was removed from your account.', short: 'bank account delete', logged: 'bank account deleted' },
    [PURPOSES.PRIMARY]: { ask: 'change your primary bank account', done: 'Your primary bank account was changed.', short: 'primary bank account change', logged: 'primary bank account changed' },
};

const ADD_FIELDS = ['holder_name', 'account', 'ifsc_code', 'bank_name', 'account_type', 'addhar_number', 'upi_id', 'phone_pay', 'g_pay', 'paytm'];
const CHALLENGE_ID = /^\d{1,18}$/;

const expired = (message = 'This verification has expired. Please start again.', reason = 'expired') =>
    fail(message, 400, { restartOtp: true, reason });

class AccountOtpService {
    static get PURPOSES() {
        return PURPOSES;
    }

    static isEnabled() {
        return String(process.env.ACCOUNT_OTP_ENABLED || '').toLowerCase() === 'true';
    }

    // ---- what a code is tied to -------------------------------------------------------------

    static canonical(purpose, payload) {
        if (purpose === PURPOSES.ADD) {
            return JSON.stringify(ADD_FIELDS.map((key) => String((payload && payload[key]) ?? '').trim().toLowerCase()));
        }
        return JSON.stringify([Number(payload && payload.account_id)]);
    }

    // Only a fingerprint of the details is stored, never the account number itself.
    static payloadHash(purpose, userId, payload) {
        return crypto.createHmac('sha256', String(process.env.JWT_SECRET))
            .update(`${purpose}|${userId}|${this.canonical(purpose, payload)}`)
            .digest('hex');
    }

    static sameText(a, b) {
        const left = Buffer.from(String(a || ''));
        const right = Buffer.from(String(b || ''));
        return left.length === right.length && crypto.timingSafeEqual(left, right);
    }

    // ---- masked hints (never a full number) -------------------------------------------------

    static maskUpi(upi) {
        const [name, handle] = String(upi || '').trim().split('@');
        if (!name || !handle) return null;
        return `${name.slice(0, 2)}***@${handle}`;
    }

    static maskAccount(accountNumber) {
        const digits = String(accountNumber || '').replace(/\s/g, '');
        return digits.length >= 4 ? `A/c ****${digits.slice(-4)}` : null;
    }

    static hintFrom({ upi, accountNumber }) {
        return [this.maskUpi(upi), this.maskAccount(accountNumber)].filter(Boolean).join(' | ') || null;
    }

    // The hint for the log and the emails. For delete / set primary it comes from the saved account.
    static async hintFor(purpose, userId, payload) {
        if (purpose === PURPOSES.ADD) {
            return this.hintFrom({ upi: payload.upi_id, accountNumber: payload.account });
        }
        const row = await accountHistoryModel.getAccountHintFields(userId, payload.account_id);
        return row ? this.hintFrom({ upi: row.upi_id, accountNumber: row.account_number }) : null;
    }

    // What the emails say about the request: the IP address and the browser name, nothing else.
    static requestInfo(req) {
        return {
            ip: clientIp(req) || 'Unknown',
            browser: browserName(clientBrowser(req)),
        };
    }

    // ---- the flow used by the three endpoints -----------------------------------------------

    // Returns { proceed: true } when the caller may make the change now (feature off, or a correct
    // code was sent with it), or { proceed: false, challengeId, maskedEmail } after sending a code.
    // precheck runs only before a code is sent, so nobody is mailed a code for something that
    // would be refused anyway; the real checks still run when the change is made.
    static async gateAction(req, userId, purpose, payload, { hint = null, precheck = null } = {}) {
        if (!this.isEnabled()) {
            return { proceed: true };
        }

        const { challengeId, otp } = req.body || {};
        if (challengeId === undefined && otp === undefined) {
            if (precheck) await precheck();
            return { proceed: false, ...(await this.begin(req, userId, purpose, payload, hint)) };
        }

        await this.confirm(req, userId, purpose, payload, challengeId, otp, hint);
        return { proceed: true };
    }

    static async begin(req, userId, purpose, payload, hint) {
        const [user] = await userModel.findUserById(userId);
        const email = String((user && user.email) || '').trim();
        if (!email) {
            throw fail('We could not find an email on your account to send the code to. Please add your email first.', 403, { emailRequired: true });
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        const id = await accountOtpCodeModel.create({
            userId,
            purpose,
            otp,
            payloadHash: this.payloadHash(purpose, userId, payload),
        });

        this.sendCodeMail(email, user.first_name, otp, purpose, hint, this.requestInfo(req));
        this.logStep(req, userId, purpose, 'sent', { hint });

        return { challengeId: String(id), maskedEmail: DeviceTrust.maskEmail(email) };
    }

    static async confirm(req, userId, purpose, payload, challengeId, otp, hint) {
        try {
            await this.verifyChallenge(userId, purpose, payload, challengeId, otp);
        } catch (error) {
            this.logStep(req, userId, purpose, 'failed', { reason: error.reason || 'rejected', hint });
            throw error;
        }
    }

    static async verifyChallenge(userId, purpose, payload, challengeId, otp) {
        if (!CHALLENGE_ID.test(String(challengeId || '')) || !/^\d{6}$/.test(String(otp || ''))) {
            throw fail('Please enter the 6-digit code.', 400, { reason: 'bad_format' });
        }

        const row = await accountOtpCodeModel.get(String(challengeId), OTP_VALID_MINUTES);
        if (!row || Number(row.user_id) !== Number(userId) || row.purpose !== purpose || row.used_at || !row.is_live) {
            throw expired();
        }

        // Counted first and atomically, so a burst of parallel guesses cannot try more than the limit.
        const used = await accountOtpCodeModel.reserveAttempt(row.id, OTP_MAX_ATTEMPTS, OTP_VALID_MINUTES);
        if (used === null) {
            throw expired('Too many wrong codes. Please start again.', 'too_many_attempts');
        }

        if (!this.sameText(row.otp, otp)) {
            const left = OTP_MAX_ATTEMPTS - used;
            if (left <= 0) {
                throw expired('Too many wrong codes. Please start again.', 'too_many_attempts');
            }
            throw fail(`Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`, 400, { reason: 'wrong_code' });
        }

        // The code is spent whatever happens next: it works once.
        if (!(await accountOtpCodeModel.consume(row.id, OTP_VALID_MINUTES))) {
            throw expired();
        }

        if (!this.sameText(row.payload_hash, this.payloadHash(purpose, userId, payload))) {
            throw expired('The details changed after the code was sent. Please start again.', 'payload_changed');
        }
    }

    static async resend(req, userId, challengeId) {
        if (!CHALLENGE_ID.test(String(challengeId || ''))) {
            throw expired();
        }

        const row = await accountOtpCodeModel.get(String(challengeId), OTP_VALID_MINUTES);
        if (!row || Number(row.user_id) !== Number(userId) || !Object.values(PURPOSES).includes(row.purpose)
            || row.used_at || !row.is_live) {
            throw expired();
        }
        if (row.resend_count >= OTP_MAX_RESENDS) {
            throw expired('Too many codes requested. Please start again.', 'too_many_resends');
        }
        const wait = RESEND_GAP_SECONDS - row.seconds_since_sent;
        if (wait > 0) {
            throw fail(`Please wait ${wait} seconds before asking for a new code.`, 429);
        }

        const [user] = await userModel.findUserById(userId);
        const email = String((user && user.email) || '').trim();
        if (!email) {
            throw expired();
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        await accountOtpCodeModel.replaceCode(row.id, otp);
        this.sendCodeMail(email, user.first_name, otp, row.purpose, null, this.requestInfo(req));

        return { maskedEmail: DeviceTrust.maskEmail(email) };
    }

    // ---- the activity log (tbl_auth_activity_log) and the emails -----------------------------

    // step: 'sent' | 'failed' | 'completed'. A wrong or expired code is a failed row, the rest are
    // successes. Never throws and is not awaited: a logging problem must never stop the change.
    static logStep(req, userId, purpose, step, { reason = null, hint = null, acId = null } = {}) {
        const text = TEXT[purpose];
        const tail = [hint, acId ? `ac_id ${acId}` : null].filter(Boolean).join(' | ');
        const withTail = (label) => (tail ? `${label} | ${tail}` : label);

        if (step === 'failed') {
            authLog.recordFailure(req, {
                method: 'session', reason, userId, eventType: 'profile_update',
                details: withTail(`${text.short}: ${String(reason || 'rejected').replace(/_/g, ' ')}`),
            });
            return;
        }

        authLog.record(req, {
            userId, eventType: 'profile_update', method: 'session',
            details: withTail(step === 'completed' ? text.logged : `${text.short}: code sent`),
        });
    }

    // Called after the change has been made. The log is written whether or not the code check is
    // switched on; the alert email only goes out when it is.
    static completed(req, userId, purpose, { acId = null, hint = null } = {}) {
        this.logStep(req, userId, purpose, 'completed', { acId, hint });
        if (this.isEnabled()) {
            this.sendChangedAlert(req, userId, purpose, hint);
        }
    }

    static sendCodeMail(email, firstName, otp, purpose, hint, info) {
        const content = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; text-align: center;">
                <h2>Gaming Helper Online</h2>
                <p>Hello ${escapeHtml(firstName || 'there')},</p>
                <p>Someone asked to <strong>${escapeHtml(TEXT[purpose].ask)}</strong> on your account${hint ? ` (${escapeHtml(hint)})` : ''}. Enter this code to confirm:</p>
                <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;">${otp}</p>
                <p>This code is valid for ${OTP_VALID_MINUTES} minutes. Never share it with anyone, not even our staff.</p>
                <p style="color: #666; font-size: 13px;">IP address: ${escapeHtml(info.ip)}<br>Browser: ${escapeHtml(info.browser)}</p>
                <p style="color: #666; font-size: 13px;">If this was not you, do not enter the code. Change your password and contact support.</p>
            </div>`;
        Promise.resolve(sendMail(email, 'Gaming Helper Online - Confirm your bank account change', content))
            .catch((error) => logger.error(`Account OTP email could not be sent: ${error.message}`));
    }

    static sendChangedAlert(req, userId, purpose, hint) {
        (async () => {
            const [user] = await userModel.findUserById(userId);
            const email = String((user && user.email) || '').trim();
            if (!email) return;

            const info = this.requestInfo(req);
            const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const content = `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2>Gaming Helper Online</h2>
                    <p>Hello ${escapeHtml(user.first_name || 'there')},</p>
                    <p>${escapeHtml(TEXT[purpose].done)}${hint ? ` (${escapeHtml(hint)})` : ''}</p>
                    <p style="color: #444;">Time: ${escapeHtml(when)} (IST)<br>IP address: ${escapeHtml(info.ip)}<br>Browser: ${escapeHtml(info.browser)}</p>
                    <p>If this was you, no action is needed. If not, change your password immediately and contact support.</p>
                </div>`;
            await sendMail(email, 'Your bank account was changed', content);
        })().catch((error) => logger.error(`Bank account alert email could not be sent: ${error.message}`));
    }
}

module.exports = AccountOtpService;
