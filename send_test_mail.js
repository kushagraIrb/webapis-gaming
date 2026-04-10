require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      requireTLS: true
    });

    const info = await transporter.sendMail({
      from: `"Gaming Helper" <${process.env.SMTP_MAIL}>`,
    //   to: process.env.RECEIVER_EMAIL,
      to: 'kushagraa487@gmail.com',
      subject: "SMTP Test Email",
      html: `<h2>SMTP is working!</h2><p>This is a test email.</p>`
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
})();