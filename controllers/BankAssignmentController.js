const { logger } = require('../logger');
const bankAssignmentService = require('../services/bankAssignmentService');

// Deposit page, Step 1 and Step 2: which bank account the user is shown, switching it, picking an earlier one.
// Errors with a statusCode/code come from the service on purpose (the page reacts to `code`); anything else is a 500.
function sendError(res, error, what) {
    if (error.statusCode) {
        return res.status(error.statusCode).send({ status: false, code: error.code, message: error.message });
    }
    logger.error(`Bank assignment ${what} failed: ${error.message}`, { stack: error.stack });
    return res.status(500).send({ status: false, message: 'Something went wrong, please try again.' });
}

class BankAssignmentController {
    // POST /deposit/bank-account/assign   { amount }
    async assign(req, res) {
        try {
            const result = await bankAssignmentService.assign(req.user_id, req.body && req.body.amount);
            if (!result.configured) {
                // not set up yet: same answer the old call gives, no assignment
                const bank = await bankAssignmentService.legacyAccount(req.body.amount);
                return res.status(200).send({
                    status: true,
                    message: 'Bank account fetched successfully',
                    data: { assignment_id: null, bank, previous: [], is_universal: false, can_switch: false },
                });
            }
            const { configured, ...data } = result;
            return res.status(200).send({ status: true, message: 'Bank account fetched successfully', data });
        } catch (error) {
            return sendError(res, error, 'assign');
        }
    }

    // POST /deposit/bank-account/shown   { assignment_id }   (the Step 2 page loaded with the account)
    async shown(req, res) {
        try {
            const data = await bankAssignmentService.shown(req.user_id, Number(req.body && req.body.assignment_id));
            return res.status(200).send({ status: true, data });
        } catch (error) {
            return sendError(res, error, 'shown');
        }
    }

    // POST /deposit/bank-account/select   { assignment_id, bank_id }   (one of the earlier accounts in the dropdown)
    async select(req, res) {
        try {
            const { assignment_id, bank_id } = req.body || {};
            const data = await bankAssignmentService.select(req.user_id, Number(assignment_id), bank_id);
            return res.status(200).send({ status: true, message: 'Bank account changed', data });
        } catch (error) {
            return sendError(res, error, 'select');
        }
    }

    // POST /deposit/bank-account/switch   { assignment_id, reason? }   (the "switch account" button)
    async switchAccount(req, res) {
        try {
            const { assignment_id, reason } = req.body || {};
            const data = await bankAssignmentService.switchAccount(req.user_id, Number(assignment_id), reason);
            return res.status(200).send({ status: true, message: 'Showing a different account', data });
        } catch (error) {
            return sendError(res, error, 'switch');
        }
    }
}

module.exports = new BankAssignmentController();
