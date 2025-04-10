const contactUsModel = require('../models/contactUsModel');
const sendMail = require('../helpers/sendMail');

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
            const content = `
                <p>Your Enquiry Details:</p>
                <p><strong>Name:</strong> ${contact_name}</p>
                <p><strong>Phone:</strong> ${contact_phone}</p>
                <p><strong>Message:</strong> ${contact_message}</p>
                <p><strong>Email ID:</strong> ${contact_email}</p>
            `;

            await sendMail(contact_email, mailSubject, content);

            console.log('Email sent successfully.');
            return true;
        } catch (error) {
            console.error('Error sending email:', error.message);
            return false;
        }
    }
}

module.exports = ContactUsService;