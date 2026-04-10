require('dotenv').config();
const nodemailer = require('nodemailer');
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env; // Only declare once

(async () => {
    try {
        console.log(`Testing SMTP connection to ${SMTP_HOST}:${SMTP_PORT} ...`);

        // Create a transporter just for testing
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465, // true for 465, false for 587/25
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            },
            requireTLS: true,
            connectionTimeout: 10000, // 10s
            greetingTimeout: 5000,
            socketTimeout: 10000,
            tls: {
                rejectUnauthorized: false // allow self-signed certs temporarily
            },
            debug: true, // detailed SMTP logs
            logger: true
        });

        // Verify connection and authentication
        const info = await transporter.verify();
        console.log('✅ SMTP connection successful!');
        console.log('Server response:', info);
    } catch (error) {
        console.error('❌ SMTP connection failed:');
        console.error('Error code:', error.code || 'N/A');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
    }
})();