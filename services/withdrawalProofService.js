const withdrawalProofModel = require('../models/withdrawalProofModel');

class WithdrawalProofService {
    static async getLatest75Records(perPage, page) {
        const offset = (page - 1) * perPage;

        // The list is "the latest 75": never return rows beyond that, whatever page is asked for.
        const MAX_ROWS = 75;
        const remaining = MAX_ROWS - offset;
        const data = remaining > 0
            ? await withdrawalProofModel.fetchLatest75Records(Math.min(perPage, remaining), offset)
            : [];
        const totalCount = await withdrawalProofModel.getTotalWithdrawalCount();

        return { data, totalCount };
    }
}

module.exports = WithdrawalProofService;