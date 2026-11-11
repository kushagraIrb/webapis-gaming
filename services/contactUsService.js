const contactUsModel = require('../models/contactUsModel');
const sendMail = require('../helpers/sendMail');
const { RECEIVER_EMAIL } = process.env;

class ContactUsService {
  // Get contact details from the database
    static async getContactDetails() {
        try {
            return await contactUsModel.fetchContactDetails();
        } catch (error) {
            console.error('Error saving contact details:', error.message);
            throw new Error('Failed to save contact details.');
        }
    }
  
    // Save contact details in the database
    static async saveContactDetails(contactUsData) {
        try {
            return await contactUsModel.insertContactDetails(contactUsData);
        } catch (error) {
            console.error('Error saving contact details:', error.message);
            throw new Error('Failed to save contact details.');
        }
    }

    // Send email using sendMail helper
    static async sendEmail({ contact_name, contact_email, contact_phone, contact_message }) {
        try {
            const mailSubject = 'Enquiry';
            // Everything the visitor typed is escaped, so it shows up as text and never as markup.
            const esc = (value) => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\r?\n/g, '<br>');
            const content = `
                <p>Your Enquiry Details:</p>
                <p><strong>Name:</strong> ${esc(contact_name)}</p>
                <p><strong>Phone:</strong> ${esc(contact_phone)}</p>
                <p><strong>Message:</strong> ${esc(contact_message)}</p>
                <p><strong>Email ID:</strong> ${esc(contact_email)}</p>
            `;

            await sendMail(RECEIVER_EMAIL, mailSubject, content);

            console.log('Email sent successfully.');
            return true;
        } catch (error) {
            console.error('Error sending email:', error.message);
            return false;
        }
    }
}

module.exports = ContactUsService;