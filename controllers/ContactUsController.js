const { logger } = require('../logger');
const contactUsService = require('../services/contactUsService');

class ContactUsController {
  async getContactDetails(req, res) {
        try {
            // Fetch contact details from the database
            const contactDetails = await contactUsService.getContactDetails();

            // Respond with success and return the fetched data
            return res.status(200).send({ success: true, data: contactDetails });
        } catch (error) {
            console.error('Error handling contact form submission:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred.', error: error.message });
        }
    }
  
    async contactUs(req, res) {
        try {
            const { contact_name, contact_email, contact_phone } = req.body;

            // Validate input
            if (!contact_name || !contact_email || !contact_phone) {
                return res.status(400).send({ msg: 'All fields are required.' });
            }

            // Save contact details in the database
            await contactUsService.saveContactDetails(req.body);

            // Send email
            const emailSent = await contactUsService.sendEmail(req.body);

            // Respond with success
            return res.status(200).send({
                status: true,
                msg: 'Contact details saved successfully.',
                emailStatus: emailSent ? 'Email sent successfully.' : 'Failed to send email.',
            });
        } catch (error) {
            console.error('Error handling contact form submission:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred.', error: error.message });
        }
    }
}

module.exports = new ContactUsController();