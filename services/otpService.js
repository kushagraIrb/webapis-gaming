const sendMail = require('../helpers/sendMail');

class OtpService {
    /**
     * Generate a 4-digit OTP
     * @returns {number} - A 4-digit OTP
     */
    static generateOtp() {
        return Math.floor(1000 + Math.random() * 9000); // Generate 4-digit OTP
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