const nodemailer = require('nodemailer');
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_MAIL, SMTP_PASSWORD } = process.env;

const sendMail = async(email, mailSubject, content) => {
    try {
        const transport = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: false,
            requireTLS: true,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            }
        });

        // Ensure `email` is an array if it's comma-separated
        const recipientList = Array.isArray(email) ? email : email.split(',');

        const mailOptions = {
            from: SMTP_MAIL,
            to: recipientList, // Handles multiple recipients automatically
            subject: mailSubject,
            html: content
        };
        
        transport.sendMail(mailOptions, function(error, info){
            if(error) {
                console.log('Error sending email:', error);
            }
            else {
                console.log('Mail sent succcessfully: ', info.response);
            }
        });
    }
    catch (error) {
        console.log(error.message);
    }

}

module.exports = sendMail;