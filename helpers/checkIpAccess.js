// helpers/checkIPAccess.js
const db = require('../config/database');
const { logger } = require('../logger');

function getClientIP(req) {
    return (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        ''
    ).replace(/^::ffff:/, ''); // Normalize IPv6-mapped IPv4
}

// Middleware for normal route protection
function checkIPAccess(req, res, next) {
    const ip = getClientIP(req);

    try {
        db.query(
            'SELECT ip_status, ip_modified FROM tbl_registration WHERE ip_address = ?',
            [ip],
            (err, results) => {
                if (err) {
                    logger.error('DB error while checking IP:', err);
                    return res.status(500).json({ msg: 'Server error' });
                }

                if (results.length === 0) {
                    return next(); // IP not found, treat as allowed
                }

                const { ip_status, ip_modified } = results[0];

                const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                if (ip_status == 0 && new Date(ip_modified) < oneWeekAgo) {
                    // Update ip_status to 1
                    db.query(
                        'UPDATE tbl_registration SET ip_status = 1 WHERE ip_address = ?',
                        [ip],
                        (updateErr) => {
                            if (updateErr) {
                                logger.error('DB error while updating IP status:', updateErr);
                                return res.status(500).json({ msg: 'Server error' });
                            }

                            return next(); // Now allowed
                        }
                    );
                } else if (ip_status == 0) {
                    return res.status(403).json({ restricted: true, message: 'Access Restricted' });
                } else {
                    return next();
                }
            }
        );
    } catch (error) {
        logger.error('Unexpected error in IP check:', error);
        res.status(500).json({ msg: 'Unexpected error' });
    }
}

// Function for API to just respond true/false
function checkIPAccessStatus(req, res) {
    const ip = getClientIP(req);

    try {
        db.query(
            'SELECT ip_status, ip_modified FROM tbl_registration WHERE ip_address = ?',
            [ip],
            (err, results) => {
                if (err) {
                    logger.error('DB error while checking IP status:', err);
                    return res.status(500).json({ success: false, message: 'Server error' });
                }

                if (results.length === 0) {
                    return res.json({ success: true, allowed: true }); // IP not found, treat as allowed
                }

                const { ip_status, ip_modified } = results[0];
                const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                if (ip_status == 0 && new Date(ip_modified) < oneWeekAgo) {
                    // Update ip_status to 1
                    db.query(
                        'UPDATE tbl_registration SET ip_status = 1 WHERE ip_address = ?',
                        [ip],
                        (updateErr) => {
                            if (updateErr) {
                                logger.error('DB error while updating IP status:', updateErr);
                                return res.status(500).json({ success: false, message: 'Server error' });
                            }

                            return res.json({ success: true, allowed: true });
                        }
                    );
                } else {
                    return res.json({ success: true, allowed: ip_status != 0 });
                }
            }
        );
    } catch (error) {
        logger.error('Unexpected error in IP status check:', error);
        res.status(500).json({ success: false, message: 'Unexpected error' });
    }
}

module.exports = { checkIPAccess, checkIPAccessStatus };