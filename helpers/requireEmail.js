const EmailSetup = require('../services/emailSetupService');
const { logger } = require('../logger');

// Route guard (after authenticateToken): with EMAIL_REQUIRED_ENABLED, a user who has no email on the
// account is refused with { emailRequired: true }, and the site then asks for the email and a code.
// With the feature off this does nothing.
module.exports = async function requireEmail(req, res, next) {
    try {
        await EmailSetup.assertHasEmail(req.user_id);
        return next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            logger.error(`requireEmail check failed: ${error.message}`);
            return res.status(500).json({ msg: 'Something went wrong', message: 'Something went wrong' });
        }
        return res.status(statusCode).json({
            msg: error.message,
            message: error.message,
            ...(error.emailRequired && { emailRequired: true }),
        });
    }
};
