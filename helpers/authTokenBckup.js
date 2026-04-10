const jwt = require('jsonwebtoken');
const db = require('../config/database'); // adjust the path to your DB connection module
const util = require('util');

// Promisify query if you're using mysql or mysql2
const query = util.promisify(db.query).bind(db);

const authToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ message: 'Token not provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user_id = decoded.id;

        // Fetch user from DB
        const userQuery = `SELECT * FROM tbl_registration WHERE id = ${decoded.id}`;
        const results = await query(userQuery);

        if (results.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = results[0];

        // Check if the user is verified and active
        if (user.is_verified !== 1 || user.status !== 1) {
            return res.status(423).json({ message: 'Your login Id is blocked, please contact the administrator.' });
        }
        
        if (user.is_verified !== 1 || user.ip_status !== 1) {
            return res.status(401).json({ message: 'Your login Id is blocked, please contact the administrator.' });
        }

        next();
    } catch (err) {
        return res.status(403).json({ message: 'Token is not valid' });
    }
};

// const authToken = async (req, res, next) => {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

//     if (!token) {
//         return res.status(401).json({ message: 'Token not provided' });
//     }

//     try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         req.user_id = decoded.id;

//         // CHANGED: Query is now parameterized to prevent SQL injection and selects the session_token
//         const userQuery = 'SELECT id, is_verified, status, ip_status, session_token FROM tbl_registration WHERE id = ?';
//         const results = await query(userQuery, [decoded.id]);

//         if (results.length === 0) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         const user = results[0];

//         // ADD THESE LOGS FOR DEBUGGING
//         // console.log("-----------------------------------------");
//         // console.log("DEBUGGING SINGLE-DEVICE LOGIN");
//         // console.log("Token from Client:", token);
//         // console.log("Token from Database:", user.session_token);
//         // console.log("Do they match?", user.session_token === token);
//         // console.log("-----------------------------------------");

//         // ADDED: The crucial check to enforce single-device login
//         // Compare the client's token with the one stored in the database.
//         if (user.session_token !== token) {
//             return res.status(401).json({ message: 'Session expired. Please log in again.' });
//         }

//         // Check if the user is verified and active (your existing logic)
//         if (user.is_verified !== 1 || user.status !== 1) {
//             return res.status(423).json({ message: 'Your login Id is blocked, please contact the administrator.' });
//         }
        
//         if (user.is_verified !== 1 || user.ip_status !== 1) {
//             return res.status(401).json({ message: 'Your login Id is blocked, please contact the administrator.' });
//         }

//         next();
//     } catch (err) {
//         // This will catch expired tokens (from the 15-min lifespan) or invalid signatures
//         return res.status(403).json({ message: 'Token is not valid' });
//     }
// };

module.exports = authToken;