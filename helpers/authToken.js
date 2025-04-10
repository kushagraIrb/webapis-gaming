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
        if (user.is_verified !== 1 || user.status !== 1 || user.ip_status !== 1) {
            return res.status(403).json({ message: 'Your login Id is blocked, please contact the administrator.' });
        }

        next();
    } catch (err) {
        return res.status(403).json({ message: 'Token is not valid' });
    }
};

module.exports = authToken;