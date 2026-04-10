const withdrawalModel = require('../models/withdrawalModel');
const transactionHistoryModel = require("../models/transactionHistoryModel");
const userModel = require("../models/userModel");
const sendMail = require('../helpers/sendMail');

class WithdrawalService {
    // Get last withdrawal Date for a user
    static async getLastWithdrawalDateById(userId) {
        try {
            const withdrawalButtonStatus = await withdrawalModel.fetchLastWithdrawalDateById(userId);
            return withdrawalButtonStatus;
        } catch (error) {
            console.error('Error in withdrawal service:', error.message);
            throw error;
        }
    }

    // Service to save withdrawal request
    static async handleWithdrawal(data) {
        try {
            const { userId, withdrawalAmount, walletAmount, withdrawalOption, withdrawalText, bank, account, ifsc, holderName, panNumber, accountType, aadharNumber, upiId, phonePay, gPay, paytm } = data;

            // 1. Check if current time is allowed
            const timeCheck = await withdrawalModel.getWithdrawalTime();
            if (timeCheck.allowed === 0) {
                return {
                    status: false,
                    message: "Withdrawals are allowed only during specific time periods. Please try again later.",
                };
            }

            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            // Check if withdrawals are approved within 24 hours
            // const recentWithdrawals = await withdrawalModel.findRecentWithdrawals(userId, twentyFourHoursAgo);

            // Check if there are pending withdrawals
            const pendingWithdrawal = await withdrawalModel.findPendingWithdrawal(userId);

            if (withdrawalAmount > walletAmount) {
                return {
                    status: false,
                    message: "Your Wallet balance is low!",
                };
            } else if (pendingWithdrawal) {
                return {
                    status: false,
                    message: "You already made a request for withdrawal.",
                };
            }

            // Check deposit and betting conditions
            const lastDeposit = await transactionHistoryModel.getLastDeposit(userId);

            let lastDepositAmount = 0;
            let adjustedDebitAmount = 0;

            if (lastDeposit) {
                lastDepositAmount = lastDeposit.credit_amount;

                const totalDebit = await transactionHistoryModel.getTotalDebitsSince(userId, lastDeposit.trans_id);
                const totalCredit = await transactionHistoryModel.getTotalCreditsSince(userId, lastDeposit.trans_id);
                adjustedDebitAmount = (totalDebit || 0) - (totalCredit || 0);
            }

            const halfLastDepositAmount = parseFloat(lastDepositAmount) * 0.5;

            let bypassCondition = false;

            if (lastDeposit?.trans_id) {
                bypassCondition = await transactionHistoryModel.checkAdminTransferBypass(userId, lastDeposit.trans_id);
            }
            
            if (!bypassCondition && adjustedDebitAmount < halfLastDepositAmount) {
                return {
                    status: false,
                    message: "Use at least 70% of your deposit amount!",
                };
            }

            // Check if user has a primary account
            const primaryAccount = await withdrawalModel.findPrimaryAccount(userId);

            if (!primaryAccount) {
                return {
                    status: false,
                    message: "Please set a primary account before making a withdrawal request.",
                };
            }

            // Prepare withdrawal data for saving
            const withdrawalData = { userId, withdrawalAmount, withdrawalOption, withdrawalText, bank, account, ifsc, holderName, panNumber, accountType, aadharNumber, upiId, phonePay, gPay, paytm };

            // Save the withdrawal
            const result = await withdrawalModel.saveWithdrawal(withdrawalData);
            return {
                status: true,
                message: "Your Withdrawal Request has been sent successfully!",
                data: result,
            };
        } catch (error) {
            console.error("Error in withdrawal service:", error.message);
            throw error;
        }
    }

    static async withButtonStatus() {
        try {
            const withdrawalButtonStatus = await withdrawalModel.withdrawalButtonStatus();
            return withdrawalButtonStatus;
        } catch (error) {
            console.error('Error in withdrawal service:', error.message);
            throw error;
        }
    }

    static async getWithdrawalHistory(userId, perPage, page) {
        try {
            const withdrawalData = await withdrawalModel.getWithdrawals(userId, perPage, page);
            const totalCount = await withdrawalModel.getWithdrawalCount(userId);

            return { withdrawalData, totalCount };
        } catch (error) {
            console.error('Error in withdrawal service:', error.message);
            throw error;
        }
    }

    static async cancelWithdrawalRequest(userId, withdrawalId) {
        try {
            // Check if the withdrawal is in process
            const withdrawal = await withdrawalModel.getWithdrawalById(withdrawalId);

            if (!withdrawal || withdrawal.in_process === 1) {
                return { error: true, message: 'Your withdrawal is in process. Please try again after 1 minute.' };
            }

            // Proceed to cancel the withdrawal
            const updated = await withdrawalModel.updateWithdrawalStatus(withdrawalId, userId, {
                status: '2',
                cancelBy: 'By User'
            });

            if (!updated) {
                throw new Error('Failed to cancel the withdrawal request.');
            }

            return { status: true };
        } catch (error) {
            console.error('Error in WithdrawalService:', error.message);
            throw error;
        }
    }

    // Fetch fast withdrawal details
    static async getFastWithdrawalData() {
        try {
            const fastWithdrawalDetails = await withdrawalModel.fetchFastWithdrawalDetails();
            return fastWithdrawalDetails;
        } catch (error) {
            console.error('Error in service: ', error.message);
            throw error;
        }
    }

    // Format amount in Indian currency
    static formatIndianCurrency(amount) {
        // Ensure the amount is treated as a float and fixed to 2 decimal places
        amount = parseFloat(amount).toFixed(2); // Ensures two decimal places

        // Split the amount into the whole number and decimal parts
        const [integerPart, decimalPart] = amount.split('.');

        // Extract the last three digits of the integer part
        const lastThreeDigits = integerPart.slice(-3);
        const remainingDigits = integerPart.slice(0, -3);

        let formattedAmount;

        if (remainingDigits) {
            // Apply the Indian numbering system formatting (comma after every two digits)
            formattedAmount = remainingDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThreeDigits;
        } else {
            formattedAmount = lastThreeDigits;
        }

        // Combine the formatted integer part with the decimal part
        return `${formattedAmount}.${decimalPart}`;
    }

    // Fetch the count of slots
    static async fetchSlotCount(duration) {
        try {
            const timeMinusDuration = new Date(
                Date.now() - duration * 60 * 1000
            ).toISOString();
            const slotCount = await withdrawalModel.fetchSlotCount(timeMinusDuration);
            return slotCount;
        } catch (error) {
            console.error('Error in service while fetching slot count: ', error.message);
            throw error;
        }
    }

    // Fetch last modified timestamp for the user's fast withdrawal request
    static async getDurationTimer(userId) {
        try {
            const durationTimer = await withdrawalModel.fetchDurationTimer(userId);
            return durationTimer;
        } catch (error) {
            console.error('Error in service while fetching last fast withdrawal:', error.message);
            throw error;
        }
    }

    // Service to save fast withdrawal request
    static async handleFastWithdrawal(data) {
        try {
            const { userId, withdrawalAmount, walletAmount, chargePercent, withdrawalOption, withdrawalText, bank, account, ifsc, holderName, panNumber, accountType, aadharNumber, upiId, phonePay, gPay, paytm } = data;

            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            // Check if there are pending withdrawals
            const pendingWithdrawal = await withdrawalModel.findPendingWithdrawal(userId);

            if (withdrawalAmount > walletAmount) {
                return {
                    status: false,
                    message: "Your Wallet balance is low!",
                };
            } else if (pendingWithdrawal) {
                return {
                    status: false,
                    message: "You already made a request for withdrawal.",
                };
            }

            // Check deposit and betting conditions
            const lastDeposit = await transactionHistoryModel.getLastDeposit(userId);

            let lastDepositAmount = 0;
            let adjustedDebitAmount = 0;

            if (lastDeposit) {
                lastDepositAmount = lastDeposit.credit_amount;

                const totalDebit = await transactionHistoryModel.getTotalDebitsSince(userId, lastDeposit.trans_id);
                const totalCredit = await transactionHistoryModel.getTotalCreditsSince(userId, lastDeposit.trans_id);
                adjustedDebitAmount = (totalDebit || 0) - (totalCredit || 0);
            }

            const halfLastDepositAmount = parseFloat(lastDepositAmount) * 0.5;

            // if (adjustedDebitAmount < halfLastDepositAmount) {
            //     return {
            //         status: false,
            //         message: "Use at least 70% of your deposit amount!",
            //     };
            // }

            // Check slot availability
            const timeMinusDuration = new Date(Date.now() - 15 * 60 * 1000); // Current time minus 15 minutes
            const slotCount = await withdrawalModel.fetchSlotCount(timeMinusDuration);
            if (slotCount > 10) {
                return {
                    status: false,
                    message: "All slots are full. Please try again later.",
                };
            }

            // Email admin, notifying them about the fast withdrawal request
            const userDetails = await userModel.fetchUserDetailsByJwtToken(userId);
            const totalAmtToDepositByAdmin = withdrawalAmount - (withdrawalAmount * chargePercent / 100);

            const mailSubject = 'New Fast Withdrawal Request';
            const content = `
                Fast withdrawal request<br>
                Name of User: <strong>${userDetails.first_name} ${userDetails.last_name}</strong>, 
                Phone: <strong>${userDetails.phone}</strong><br>
                Amount: Rs.<strong>${totalAmtToDepositByAdmin}</strong>
            `;

            await sendMail('Joker88563@gmail.com, birenoffice232@gmail.com', mailSubject, content);
            // await sendMail('kushagra.agrawal@logzerotechnologies.com', mailSubject, content);

            // Prepare withdrawal data for saving
            const withdrawalData = { userId, withdrawalAmount, chargePercent, withdrawalOption, withdrawalText, bank, account, ifsc, holderName, panNumber, accountType, aadharNumber, upiId, phonePay, gPay, paytm };

            // Save the withdrawal
            const result = await withdrawalModel.saveFastWithdrawal(withdrawalData);

            return {
                status: true,
                message: "Your Fast Withdrawal Request has been sent successfully!",
                data: result,
            };
        } catch (error) {
            console.error("Error in withdrawal service:", error.message);
            throw error;
        }
    }

    static async getPendingRequestsCount(userId) {
        try {
            const pendingRequestsCount = await withdrawalModel.fetchPendingRequestsCount(userId);
            return pendingRequestsCount;
        } catch (error) {
            console.error('Error in pending requests service:', error.message);
            throw error;
        }
    }
}

module.exports = WithdrawalService;