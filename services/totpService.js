const crypto = require('crypto');
const QRCode = require('qrcode');
const totpModel = require('../models/totpModel');

// Google Authenticator (and any other TOTP app): RFC 6238, SHA-1, 6 digits, 30 second steps.
// The secret is stored encrypted (AES-256-GCM) with TOTP_ENC_KEY (32 bytes as 64 hex characters).
// Losing that key makes every saved secret unreadable, so keep a copy of it safe.

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // accept the previous and next step too (clock drift)
const ISSUER = 'Gaming Helper';
const BACKUP_CODE_COUNT = 8;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function base32Encode(buffer) {
    let bits = 0, value = 0, out = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(text) {
    let bits = 0, value = 0;
    const bytes = [];
    for (const ch of String(text).replace(/=+$/, '').toUpperCase()) {
        const idx = BASE32.indexOf(ch);
        if (idx < 0) throw new Error('Invalid base32');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

class TotpService {
    // ---- the code itself -------------------------------------------------------------------

    static hotp(secretBuffer, counter) {
        const msg = Buffer.alloc(8);
        msg.writeBigUInt64BE(BigInt(counter));
        const hmac = crypto.createHmac('sha1', secretBuffer).update(msg).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
        return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
    }

    static currentStep(now = Date.now()) {
        return Math.floor(now / 1000 / STEP_SECONDS);
    }

    // The step a code belongs to (within the window), or null. Constant-time comparison.
    static matchStep(secretBase32, code, now = Date.now()) {
        if (!/^\d{6}$/.test(String(code || ''))) return null;
        const secret = base32Decode(secretBase32);
        const given = Buffer.from(String(code));
        const current = this.currentStep(now);
        let matched = null;
        for (let step = current - WINDOW; step <= current + WINDOW; step++) {
            const expected = Buffer.from(this.hotp(secret, step));
            if (crypto.timingSafeEqual(expected, given) && matched === null) matched = step;
        }
        return matched;
    }

    // ---- secret storage --------------------------------------------------------------------

    static key() {
        const hex = String(process.env.TOTP_ENC_KEY || '');
        if (!/^[a-f0-9]{64}$/i.test(hex)) {
            throw fail('Authenticator is not configured on the server.', 503);
        }
        return Buffer.from(hex, 'hex');
    }

    static encrypt(secretBase32) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
        const data = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
    }

    static decrypt(stored) {
        const [iv, tag, data] = String(stored).split('.').map((p) => Buffer.from(p, 'base64'));
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }

    // ---- backup codes ----------------------------------------------------------------------

    static normalizeBackup(code) {
        return String(code || '').replace(/[\s-]/g, '').toLowerCase();
    }

    static isBackupFormat(code) {
        return /^[a-f0-9]{10}$/.test(this.normalizeBackup(code));
    }

    static backupHash(userId, code) {
        return crypto.createHmac('sha256', String(process.env.JWT_SECRET))
            .update(`totp-backup|${userId}|${this.normalizeBackup(code)}`)
            .digest('hex');
    }

    static newBackupCodes() {
        return Array.from({ length: BACKUP_CODE_COUNT }, () => crypto.randomBytes(5).toString('hex'));
    }

    // ---- setup, enable, disable ------------------------------------------------------------

    static async status(userId) {
        const enabled = await totpModel.isEnabled(userId);
        return { enabled, backupCodesLeft: enabled ? await totpModel.backupCodesLeft(userId) : 0 };
    }

    static async beginSetup(userId, accountLabel) {
        if (await totpModel.isEnabled(userId)) {
            throw fail('Authenticator is already turned on. Turn it off first to set it up again.', 409);
        }
        const secret = base32Encode(crypto.randomBytes(20));
        await totpModel.saveSetupSecret(userId, this.encrypt(secret));

        const label = encodeURIComponent(`${ISSUER}:${accountLabel || userId}`);
        const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
        return { secret, otpauth, qr: await QRCode.toDataURL(otpauth) };
    }

    // Checks a code against the user's saved secret and, if right, claims its step so it
    // cannot be used again. Returns true/false.
    static async verifyCode(userId, code) {
        const row = await totpModel.get(userId);
        if (!row) return false;
        const step = this.matchStep(this.decrypt(row.secret_enc), code);
        if (step === null) return false;
        return totpModel.claimStep(userId, step);
    }

    static async confirmEnable(userId, code) {
        const row = await totpModel.get(userId);
        if (!row || row.enabled) {
            throw fail('Start the setup first.', 400);
        }
        if (!(await this.verifyCode(userId, code))) {
            throw fail('That code is not correct. Check the code in your app and try again.', 400);
        }
        if (!(await totpModel.enable(userId))) {
            throw fail('Start the setup first.', 400);
        }
        const codes = this.newBackupCodes();
        await totpModel.replaceBackupCodes(userId, codes.map((c) => this.backupHash(userId, c)));
        return { backupCodes: codes };
    }

    // A code from the app or a backup code. Used by the login step and by "turn off".
    static async verifyAny(userId, code) {
        if (this.isBackupFormat(code)) {
            return totpModel.consumeBackupCode(userId, this.backupHash(userId, code));
        }
        return this.verifyCode(userId, code);
    }

    static async disable(userId) {
        await totpModel.remove(userId);
    }
}

TotpService.BACKUP_CODE_COUNT = BACKUP_CODE_COUNT;
module.exports = TotpService;
