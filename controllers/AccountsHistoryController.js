const { parsePaging } = require('../helpers/paging');
const { logger } = require('../logger');
const accountHistoryService = require('../services/accountHistoryService');
const accountHistoryModel = require('../models/accountHistoryModel');
const AccountOtp = require('../services/accountOtpService');

// account_id must be a whole number. Anything else (an object or array, which the database layer
// would expand into SQL, a negative number, text) is refused before it reaches a query.
const parseAccountId = (value) => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value.trim())) return Number(value.trim());
    return null;
};

// The 202 answer that asks the panel to show the code screen.
const otpRequiredResponse = (res, gate) => res.status(202).send({
    otpRequired: true,
    challengeId: gate.challengeId,
    email: gate.maskedEmail,
    message: `We sent a verification code to ${gate.maskedEmail}.`,
});

class AccountHistoryController {
    // Fetch account history for a user
    async fetchAccountHistory(req, res) {
        try {
            const userId = req.user_id;
            const { page, perPage } = parsePaging(req.query); // Query parameters

            // Fetch account history or count using the service
            const { accountData, totalCount } = await accountHistoryService.fetchAccountHistory(userId, Number(page), Number(perPage));

            return res.status(200).send({
                status: true,
                data: accountData,
                count: totalCount,
                currentPage: Number(page),
                perPage: Number(perPage),
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Account history fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching account history:', error.message);
            logger.error(`Error fetching account history: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching account history',
                error: error.message,
            });
        }
    }

    // Change primary account for a user
    async changePrimary(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { account_id: rawAccountId } = req.body; // Ensure these values come from the request body

            if (!rawAccountId) {
                return res.status(400).send({ msg: 'Account ID are required!' });
            }

            const account_id = parseAccountId(rawAccountId);
            if (!account_id) {
                return res.status(400).send({ status: false, message: 'A valid account ID is required.' });
            }

            // With ACCOUNT_OTP_ENABLED the change is made only on the second call, which carries
            // the emailed code. The first call just sends the code.
            const payload = { account_id };
            const hint = await AccountOtp.hintFor(AccountOtp.PURPOSES.PRIMARY, userId, payload);
            const gate = await AccountOtp.gateAction(req, userId, AccountOtp.PURPOSES.PRIMARY, payload, {
                hint,
                precheck: () => accountHistoryModel.assertCanMakePrimary(userId, account_id),
            });
            if (!gate.proceed) {
                return otpRequiredResponse(res, gate);
            }

            const result = await accountHistoryService.changePrimaryAccount(userId, account_id);
            AccountOtp.completed(req, userId, AccountOtp.PURPOSES.PRIMARY, { acId: account_id, hint });

            return res.status(200).send({
                status: true,
                data: result,
                message: 'Primary account updated successfully',
            });
        } catch (error) {
            if (error.statusCode && error.statusCode < 500) {
                return res.status(error.statusCode).send({
                    status: false,
                    message: error.message,
                    ...(error.restartOtp && { restartOtp: true }),
                ...(error.emailRequired && { emailRequired: true }),
                });
            }

            console.error('Error changing primary account:', error.message);
            logger.error(`Error changing primary account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while changing the primary account',
            });
        }
    }


    async softDelete(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).send({ msg: 'User ID is required!' });
            }

            const { account_id: rawAccountId } = req.body;

            if (!rawAccountId) {
                return res.status(400).send({ msg: 'Account ID is required!' });
            }

            const account_id = parseAccountId(rawAccountId);
            if (!account_id) {
                return res.status(400).send({ status: false, message: 'A valid account ID is required.' });
            }

            // With ACCOUNT_OTP_ENABLED the account is deleted only on the second call, which carries
            // the emailed code. The first call just sends the code.
            const payload = { account_id };
            const hint = await AccountOtp.hintFor(AccountOtp.PURPOSES.DELETE, userId, payload);
            const gate = await AccountOtp.gateAction(req, userId, AccountOtp.PURPOSES.DELETE, payload, {
                hint,
                precheck: async () => {
                    const account = await accountHistoryModel.getAccountById(userId, account_id);
                    if (!account || account.is_soft_deleted) {
                        const err = new Error('Account not found');
                        err.statusCode = 404;
                        throw err;
                    }
                    if (account.primary_account === 1) {
                        const err = new Error('You cannot delete the primary account.');
                        err.statusCode = 400;
                        throw err;
                    }
                },
            });
            if (!gate.proceed) {
                return otpRequiredResponse(res, gate);
            }

            // Call the service
            const result = await accountHistoryService.softDeleteAccount(userId, account_id);

            // If the service returned false, it means the account is primary
            if (result === false) {
                return res.status(400).send({
                    status: false,
                    message: 'You cannot delete the primary account.',
                });
            }

            AccountOtp.completed(req, userId, AccountOtp.PURPOSES.DELETE, { acId: account_id, hint });

            // If deletion was successful
            return res.status(200).send({
                status: true,
                message: 'Account deleted successfully.',
            });

        } catch (error) {
            if (error.statusCode && error.statusCode < 500) {
                return res.status(error.statusCode).send({
                    status: false,
                    message: error.message,
                    ...(error.restartOtp && { restartOtp: true }),
                ...(error.emailRequired && { emailRequired: true }),
                });
            }

            console.error('Error soft deleting account:', error.message);
            logger.error(`Error soft deleting account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while deleting account as soft.',
            });
        }
    }

    // Sends a new bank account code for a change that is waiting for one.
    async resendOtp(req, res) {
        try {
            const { challengeId } = req.body || {};
            const { maskedEmail } = await AccountOtp.resend(req, req.user_id, challengeId);

            return res.status(200).send({
                status: true,
                message: `We sent a new verification code to ${maskedEmail}.`,
                email: maskedEmail,
            });
        } catch (error) {
            if (error.statusCode && error.statusCode < 500) {
                return res.status(error.statusCode).send({
                    status: false,
                    message: error.message,
                    ...(error.restartOtp && { restartOtp: true }),
                ...(error.emailRequired && { emailRequired: true }),
                });
            }

            logger.error(`Error resending account OTP: ${error.message}`, { stack: error.stack });
            return res.status(500).send({ status: false, message: 'Something went wrong' });
        }
    }

    // FUNCTION: Get Primary Account Details
    async getPrimaryAccount(req, res) {
        try {
            const userId = req.user_id;

            const result = await accountHistoryService.getPrimaryAccount(userId);

            if (!result.success) {
                return res.status(404).send({
                    status: false,
                    message: result.message || 'Primary account not found',
                });
            }

            return res.status(200).send({
                status: true,
                data: result.data,
                message: 'Primary account fetched successfully',
            });
        } catch (error) {
            console.error('Error fetching primary account:', error.message);
            logger?.error(`Error fetching primary account: ${error.message}`, { stack: error.stack });

            return res.status(500).send({
                status: false,
                message: 'An error occurred while fetching primary account',
                error: error.message,
            });
        }
    }


}

module.exports = new AccountHistoryController();