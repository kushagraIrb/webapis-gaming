const db = require('../config/database');
const moment = require('moment');

class contactUsModel {
  // Fetch contact details from the database
    static async fetchContactDetails() {
        try {
            const query = `
                SELECT email, phone, address, website, facebook, twitter, youtube, linkedin, instagram, telegram, whatsapp, title, footer_description 
                FROM tbl_contact_info 
                WHERE status = 1
            `;
    
            const [result] = await db.promise().query(query);
            return result;
        } catch (error) {
            console.error('Error fetching contact details from the database:', error.message);
            throw new Error('Database query failed.');
        }
    }   
  
    // Insert contact details into the database
    static async insertContactDetails({ contact_name, contact_email, contact_phone, contact_message }) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_enquiry (contact_name, contact_email, contact_phone, contact_message, modified) VALUES (?, ?, ?, ?, ?)`;
            const params = [
                contact_name.trim(),
                contact_email.trim(),
                contact_phone.trim(),
                contact_message.trim(),
                istTime
            ];

            const [result] = await db.promise().query(query, params);
            return result;
        } catch (error) {
            console.error('Error inserting contact details into database:', error.message);
            throw new Error('Database insertion failed.');
        }
    }
}

module.exports = contactUsModel;