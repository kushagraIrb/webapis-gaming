const crypto = require('crypto');
const { deliverOtp } = require('../helpers/otpDelivery');

class OtpService {
    /**
     * Generate a 4-digit OTP
     * @returns {number} - A 4-digit OTP
     */
    static generateOtp() {
        return crypto.randomInt(1000, 10000); // 4-digit OTP from a cryptographically secure source
    }

    /**
     * Send OTP via email
     * @param {string} email - Recipient's email address
     * @param {string} subject - Email subject
     * @param {string} content - Email content (HTML)
     * @param {number|string} code - The code inside the email (returned to the screen when EMAIL_OTP_ENABLED=false)
     * @returns {Promise<void>}
     */
    static async sendOtpEmail(email, subject, content, code) {
        await deliverOtp({ kind: 'registration code', to: email, subject, html: content, code });
    }
}

module.exports = OtpService;