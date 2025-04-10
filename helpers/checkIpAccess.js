// helpers/checkIPAccess.js
const db = require('../config/database');
const { logger } = require('../logger');

function checkIPAccess(req, res, next) {
    let ip = (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        ''
    ).replace(/^::ffff:/, ''); // Normalize IPv6-mapped IPv4

    // Optional: log for debug
    // console.log('User IP:', ip);

    try {
        db.query(
            'SELECT ip_status FROM tbl_registration WHERE ip_address = ?',
            [ip],
            (err, results) => {
                if (err) {
                    logger.error('DB error while checking IP:', err);
                    return res.status(500).json({ msg: 'Server error' });
                }

                const restricted = results.some(row => row.ip_status == 0);

                if (restricted) {
                    return res.status(403).json({ restricted: true, message: 'Access Restricted' });
                }

                next();
            }
        );
    } catch (error) {
        logger.error('Unexpected error in IP check:', error);
        res.status(500).json({ msg: 'Unexpected error' });
    }
}

module.exports = checkIPAccess;