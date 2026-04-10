const nodemailer = require('nodemailer');
require('dotenv').config(); // Ensure env variables are loaded

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_MAIL, SMTP_PASSWORD } = process.env;

// Check required env variables
if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_MAIL) {
    console.error('❌ Please set all required SMTP environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_MAIL');
    process.exit(1);
}

const sendMail = async (email, mailSubject, content) => {
    try {
        console.log('🔎 Creating SMTP transporter...');
        const transport = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465, // true for 465, false for 587/25
            requireTLS: true,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            },
            connectionTimeout: 10000,
            greetingTimeout: 5000,
            socketTimeout: 10000,
            tls: {
                rejectUnauthorized: false // allows self-signed certs temporarily
            },
            debug: true, // logs SMTP conversation
            logger: true
        });

        // Verify connection & authentication
        console.log('🔎 Verifying SMTP connection...');
        await transport.verify();
        console.log('✅ SMTP connection verified successfully!');

        // Ensure email is an array
        const recipientList = Array.isArray(email) ? email : email.split(',');

        const mailOptions = {
            from: SMTP_MAIL,
            to: recipientList,
            subject: mailSubject,
            html: content
        };

        console.log(`📧 Sending email to: ${recipientList.join(', ')}`);
        const info = await transport.sendMail(mailOptions);
        console.log('✅ Mail sent successfully!');
        console.log('Server response:', info.response);

    } catch (err) {
        console.error('❌ SMTP operation failed:');

        if (err.code === 'ETIMEDOUT') {
            console.error('Reason: Connection timed out. Check firewall, network, or SMTP host availability.');
        } else if (err.code === 'ECONNECTION') {
            console.error('Reason: Could not establish connection. Check host/port or server availability.');
        } else if (err.code === 'EAUTH') {
            console.error('Reason: Authentication failed. Check SMTP_USER and SMTP_PASSWORD or App Password requirements.');
        } else if (err.message.includes('socket hang up') || err.message.includes('Unexpected socket close')) {
            console.error('Reason: Server closed the connection unexpectedly. Likely port/secure mismatch or TLS issue.');
        } else {
            console.error('Reason: Unknown error');
        }

        console.error('Error code:', err.code || 'N/A');
        console.error('Message:', err.message);
        console.error('Stack:', err.stack);
    }
};

module.exports = sendMail;
