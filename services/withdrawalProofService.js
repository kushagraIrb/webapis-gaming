const withdrawalProofModel = require('../models/withdrawalProofModel');

class WithdrawalProofService {
    static async getLatest75Records(perPage, page) {
        const offset = (page - 1) * perPage;

        const data = await withdrawalProofModel.fetchLatest75Records(perPage, offset);
        const totalCount = await withdrawalProofModel.getTotalWithdrawalCount();

        return { data, totalCount };
    }
}

module.exports = WithdrawalProofService;