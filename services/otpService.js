const crypto = require('crypto');
const sendMail = require('../helpers/sendMail');

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
     * @returns {Promise<void>}
     */
    static async sendOtpEmail(email, subject, content) {
        await sendMail(email, subject, content);
    }
}

module.exports = OtpService;