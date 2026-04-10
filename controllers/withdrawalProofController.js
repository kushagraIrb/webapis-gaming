const { logger } = require('../logger');
const withdrawalProofService = require('../services/withdrawalProofService');

class WithdrawalProofController {
    async latest75Records(req, res) {
        try {
            const perPage = parseInt(req.query.perPage) || 5;
            const page = parseInt(req.query.page) || 1;

            const { data, totalCount } =
                await withdrawalProofService.getLatest75Records(perPage, page);

            return res.status(200).json({
                status: true,
                data,
                count: totalCount,
                currentPage: page,
                perPage,
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Withdrawal history retrieved successfully',
            });
        } catch (error) {
            logger.error(`Withdrawal Proof fetch error: ${error.message}`, { stack: error.stack });
            return res.status(500).json({
                status: false,
                message: 'Something went wrong, please try again.'
            });
        }
    }
}

module.exports = new WithdrawalProofController();