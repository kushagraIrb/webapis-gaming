const { logger } = require('../logger');
const withdrawalService = require('../services/withdrawalService');

class WithdrawalController {
    // Get last withdrawal Date for a user
    async getLastWithdrawalDateById(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: "User ID is required" });
            }

            const result = await withdrawalService.getLastWithdrawalDateById(userId);
            return res.status(200).json({ status: true, withdrawal_date: result });
        } catch (error) {
            console.error('Error retrieving withdrawal history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }

    // Save  withdrawal
    async saveWithdrawal(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: "User ID is required" });
            }

            const withdrawalData = {
                userId,
                ifsc: req.body.ifsc,
                account: req.body.account,
                bank: req.body.bank,
                holderName: req.body.holder_name,
                panNumber: req.body.pan_number,
                withdrawalAmount: parseFloat(req.body.withdrawal_amount),
                withdrawalOption: req.body.withdrawal_option || null,
                withdrawalText: req.body.withdrawal_text || null,
                walletAmount: parseFloat(req.body.walletAmount),
                accountType: req.body.account_type,
                aadharNumber: req.body.aadhar_number,
                upiId: req.body.upi_id,
                phonePay: req.body.phone_pay,
                gPay: req.body.g_pay,
                paytm: req.body.paytm,
            };

            
            // Call the service to handle withdrawal logic
            const result = await withdrawalService.handleWithdrawal(withdrawalData);
            // return res.status(200).json(result);

            if (result.status) {
                return res.status(200).json({
                    status: true,
                    message: result.message,
                });
            } else {
                return res.status(400).json({
                    status: false,
                    message: result.message,
                });
            }
        } catch (error) {
            console.error("Error saving withdrawal:", error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({
                status: false,
                message: "Something went wrong. Please try again.",
                error: error.message || error,
            });
        }
    }

    // Withdrawal buton status
    async withButtonStatus(req, res) {
        try {
            const result = await withdrawalService.withButtonStatus();
            return res.status(200).json({ status: true, buttonStatus: result });
        } catch (error) {
            console.error('Error retrieving withdrawal history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }

    // List withdrawal history
    async listWithdrawalHistory(req, res) {
        try {
            const userId = req.user_id;
            const perPage = parseInt(req.query.perPage) || 10;
            const page = parseInt(req.query.page) || 1;
    
            if (!userId) {
                return res.status(400).json({ status: false, message: 'User ID is required' });
            }
    
            const { withdrawalData, totalCount } = await withdrawalService.getWithdrawalHistory(userId, perPage, page);
    
            return res.status(200).json({
                status: true,
                data: withdrawalData,
                count: totalCount,
                currentPage: page,
                perPage,
                totalPages: Math.ceil(totalCount / perPage),
                message: 'Withdrawal history retrieved successfully',
            });
        } catch (error) {
            console.error('Error retrieving withdrawal history:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }    
    
    // Cancel withdrawal request
    async cancelRequest(req, res) {
        try {
            const userId = req.user_id;
            const withdrawalId = req.params.id;
            
            if (!userId) {
                return res.status(400).json({ status: false, message: 'User ID is required' });
            }

            const result = await withdrawalService.cancelWithdrawalRequest(userId, withdrawalId);

            if (result.error) {
                return res.status(400).json({ 
                    status: false, 
                    message: result.message || 'Soemthing went wrong.'
                });
            }

            return res.status(200).json({ 
                status: true, 
                message: 'Withdrawal Request Canceled Successfully!'
            });
        } catch (error) {
            console.error('Error cancelling the withdrawal request:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: 'Something went wrong, please try again.' });
        }
    }

    // Get fast Withdrawal data entered from Admin panel
    async getfastWithdrawalDetails(req, res) {
        try {
            // Fetch fast withdrawal details
            const fastWithdrawalDetails = await withdrawalService.getFastWithdrawalData();

            // Format amount as Indian currency
            const formattedAmount = withdrawalService.formatIndianCurrency(parseFloat(fastWithdrawalDetails.amount));

            // Calculate available slots
            const slotCount = await withdrawalService.fetchSlotCount(fastWithdrawalDetails.duration);

            // Prepare response data as a single array
            const responseData = {
              	status: fastWithdrawalDetails.status,
                charge: fastWithdrawalDetails.charge,
                duration: fastWithdrawalDetails.duration,
                amount: formattedAmount, // Renamed formatted_amount to amount
                slot: 10 - slotCount,
            };

            return res.status(200).json({
                status: true,
                data: [responseData], // Wrapping in an array as per request
                message: 'Fast withdrawal details retrieved successfully',
            });
        } catch (error) {
            console.error('Error fetching fast withdrawal details:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({
                status: false,
                message: 'Something went wrong, please try again.',
            });
        }
    }


    // Fetch last modified timestamp for the user's fast withdrawal request
    async getDurationTimer(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: "User ID is required" });
            }

            // Fetch the last modified timestamp
            const durationTimer = await withdrawalService.getDurationTimer(userId);

            // If no record is found, return 404
            if (!durationTimer) {
                return res.status(400).json({
                    status: false,
                    message: "No fast withdrawal request found for the user",
                });
            }

            // Response data
            return res.status(200).json({
                status: true,
                data: { durationTimer },
                message: "Last fast withdrawal timestamp retrieved successfully",
            });
        } catch (error) {
            console.error("Error fetching fast withdrawal details:", error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({
                status: false,
                message: "Something went wrong, please try again.",
            });
        }
    }

    // Save Fast withdrawal
    async saveFastWithdrawal(req, res) {
        try {
            const userId = req.user_id;

            if (!userId) {
                return res.status(400).json({ status: false, message: "User ID is required" });
            }

            const withdrawalData = {
                userId,
                ifsc: req.body.ifsc,
                account: req.body.account,
                bank: req.body.bank,
                holderName: req.body.holder_name,
                panNumber: req.body.pan_number,
                withdrawalAmount: parseFloat(req.body.withdrawal_amount),
                chargePercent: parseFloat(req.body.charge),
                withdrawalOption: req.body.withdrawal_option || null,
                withdrawalText: req.body.withdrawal_text || null,
                walletAmount: parseFloat(req.body.walletAmount),
                accountType: req.body.account_type,
                aadharNumber: req.body.aadhar_number,
                upiId: req.body.upi_id,
                phonePay: req.body.phone_pay,
                gPay: req.body.g_pay,
                paytm: req.body.paytm,
            };

            // Call the service to handle withdrawal logic
            const result = await withdrawalService.handleFastWithdrawal(withdrawalData);

            if (result.status) {
                return res.status(200).json({
                    status: true,
                    message: result.message,
                });
            } else {
                return res.status(400).json({
                    status: false,
                    message: result.message,
                });
            }
        } catch (error) {
            console.error("Error saving fast withdrawal:", error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({
                status: false,
                message: "Something went wrong. Please try again.",
            });
        }
    }
}

module.exports = new WithdrawalController();