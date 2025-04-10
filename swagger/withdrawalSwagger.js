/**
 * @swagger
 * /api/withdrawal/history:
 *   get:
 *     summary: Fetch withdrawal history for a user
 *     description: Retrieve the withdrawal history for a user, with pagination support.
 *     tags:
 *       - Withdrawal
 *     parameters:
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page (default is 10).
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (default is 1).
 *     responses:
 *       200:
 *         description: Successfully fetched withdrawal history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       transactionID:
 *                         type: string
 *                         example: "TX12345"
 *                       screen_short:
 *                         type: string
 *                         example: "file.png"
 *                       account_number:
 *                         type: string
 *                         example: "1234567890"
 *                       ifsc:
 *                         type: string
 *                         example: "IFSC001"
 *                       withdrawal_amount:
 *                         type: number
 *                         format: float
 *                         example: 1500.50
 *                       status:
 *                         type: string
 *                         example: "Pending"
 *                       modified:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-12T14:30:00Z"
 *                       cancelBy:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                       cancel_reason:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                 count:
 *                   type: integer
 *                   example: 50
 *                 current_page:
 *                   type: integer
 *                   example: 1
 *                 per_page:
 *                   type: integer
 *                   example: 10
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: "Withdrawal history fetched successfully"
 *       204:
 *         description: No withdrawal history found for the given user.
 *       400:
 *         description: Invalid request parameters or missing user ID.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/withdrawal/cancel-request/{id}:
 *   get:
 *     summary: Cancel a withdrawal request
 *     description: Cancel a specific withdrawal request made by the user.
 *     tags:
 *       - Withdrawal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the withdrawal request to be canceled.
 *     responses:
 *       200:
 *         description: Successfully canceled the withdrawal request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Withdrawal request canceled successfully."
 *       400:
 *         description: Invalid request parameters or missing user ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid withdrawal ID or user ID."
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access."
 *       404:
 *         description: Withdrawal request not found or already processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Withdrawal request not found or already processed."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */

/**
 * @swagger
 * /api/withdrawal/save-request:
 *   post:
 *     summary: Save a withdrawal request
 *     description: Save a new withdrawal request made by the user.
 *     tags:
 *       - Withdrawal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank:
 *                 type: string
 *                 example: "Bank of XYZ"
 *                 description: Name of the bank for withdrawal.
 *               account:
 *                 type: string
 *                 example: "1234567890"
 *                 description: The account number where the withdrawal will be processed.
 *               ifsc:
 *                 type: string
 *                 example: "XYZ1234"
 *                 description: The IFSC code of the bank branch.
 *               holderName:
 *                 type: string
 *                 example: "John Doe"
 *                 description: Name of the account holder.
 *               panNumber:
 *                 type: string
 *                 example: "ABCDE1234F"
 *                 description: PAN number of the account holder.
 *               accountType:
 *                 type: string
 *                 example: "Savings"
 *                 description: Type of the account (e.g., Savings, Current).
 *               aadharNumber:
 *                 type: string
 *                 example: "123456789012"
 *                 description: Aadhar number of the account holder.
 *               upiId:
 *                 type: string
 *                 example: "john.doe@upi"
 *                 description: UPI ID for withdrawal.
 *               phonePay:
 *                 type: string
 *                 example: "john.doe@phonepay"
 *                 description: PhonePay ID for withdrawal.
 *               gPay:
 *                 type: string
 *                 example: "john.doe@gpay"
 *                 description: GooglePay ID for withdrawal.
 *               paytm:
 *                 type: string
 *                 example: "john.doe@paytm"
 *                 description: Paytm ID for withdrawal.
 *               withdrawalAmount:
 *                 type: number
 *                 format: float
 *                 example: 1000.50
 *                 description: Amount to be withdrawn.
 *               withdrawalOption:
 *                 type: string
 *                 example: "UPI"
 *                 description: The withdrawal option (e.g., UPI, Bank Transfer).
 *               withdrawalText:
 *                 type: string
 *                 nullable: true
 *                 example: "For personal expenses."
 *                 description: Additional details or comments for the withdrawal (optional).
 *     responses:
 *       200:
 *         description: Successfully saved the withdrawal request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Your Withdrawal Request has been send successfully!"
 *       400:
 *         description: Invalid request parameters or missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid input parameters."
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */

/**
 * @swagger
 * /api/withdrawal/get-fast-withdrawal-details:
 *   get:
 *     summary: Fetch fast withdrawal data entered from the admin panel (status, max limit, charge and duration)
 *     tags:
 *       - Fast Withdrawal
 *     responses:
 *       200:
 *         description: Fast withdrawal data retrieved successfully
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "An error occurred while processing your request"
 */

/**
 * @swagger
 * /api/withdrawal/get-durationTimer:
 *   get:
 *     summary: Fetch the last fast withdrawal modified timestamp for the logged-in user
 *     tags:
 *       - Fast Withdrawal
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Last fast withdrawal timestamp retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     durationTimer:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-16T10:30:00"
 *                 message:
 *                   type: string
 *                   example: "Last fast withdrawal timestamp retrieved successfully"
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */

/**
 * @swagger
 * /api/withdrawal/save-fast-request:
 *   post:
 *     summary: Save a fast withdrawal request
 *     description: Save a new fast withdrawal request made by the user.
 *     tags:
 *       - Fast Withdrawal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank:
 *                 type: string
 *                 example: "Bank of XYZ"
 *                 description: Name of the bank for withdrawal.
 *               account:
 *                 type: string
 *                 example: "1234567890"
 *                 description: The account number where the withdrawal will be processed.
 *               ifsc:
 *                 type: string
 *                 example: "XYZ1234"
 *                 description: The IFSC code of the bank branch.
 *               holderName:
 *                 type: string
 *                 example: "John Doe"
 *                 description: Name of the account holder.
 *               panNumber:
 *                 type: string
 *                 example: "ABCDE1234F"
 *                 description: PAN number of the account holder.
 *               accountType:
 *                 type: string
 *                 example: "Savings"
 *                 description: Type of the account (e.g., Savings, Current).
 *               aadharNumber:
 *                 type: string
 *                 example: "123456789012"
 *                 description: Aadhar number of the account holder.
 *               upiId:
 *                 type: string
 *                 example: "john.doe@upi"
 *                 description: UPI ID for withdrawal.
 *               phonePay:
 *                 type: string
 *                 example: "john.doe@phonepay"
 *                 description: PhonePay ID for withdrawal.
 *               gPay:
 *                 type: string
 *                 example: "john.doe@gpay"
 *                 description: GooglePay ID for withdrawal.
 *               paytm:
 *                 type: string
 *                 example: "john.doe@paytm"
 *                 description: Paytm ID for withdrawal.
 *               withdrawalAmount:
 *                 type: number
 *                 format: float
 *                 example: 1000.50
 *                 description: Amount to be withdrawn.
 *               charge:
 *                 type: number
 *                 format: float
 *                 example: 10.50
 *                 description: Charge to taken from the withdrawal amount.
 *               withdrawalOption:
 *                 type: string
 *                 example: "UPI"
 *                 description: The withdrawal option (e.g., UPI, Bank Transfer).
 *               withdrawalText:
 *                 type: string
 *                 nullable: true
 *                 example: "For personal expenses."
 *                 description: Additional details or comments for the withdrawal (optional).
 *     responses:
 *       200:
 *         description: Successfully saved the fast withdrawal request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Your Fast Withdrawal Request has been send successfully!"
 *       400:
 *         description: Invalid request parameters or missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid input parameters."
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */

/**
 * @swagger
 * /api/withdrawal/get-date:
 *   get:
 *     summary: Get last withdrawal date for a user
 *     description: Fetches the last withdrawal date of the authenticated user.
 *     tags:
 *       - Withdrawal
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved the last withdrawal date.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 wihtdrawal_date:
 *                   type: string
 *                   example: "2025-02-19 14:57:36"
 *                   description: The last withdrawal date in `YYYY-MM-DD HH:MM:SS` format.
 *       204:
 *         description: No withdrawal record found for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No withdrawal history found."
 *       400:
 *         description: Missing or invalid user ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User ID is required."
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */

/**
 * @swagger
 * /api/withdrawal/form-status:
 *   get:
 *     summary: Get withdrawal button status (0=>Disable,1=>Enable)
 *     description: Fetches the current status of the withdrawal button.
 *     tags:
 *       - Withdrawal
 *     responses:
 *       200:
 *         description: Successfully retrieved the withdrawal button status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 buttonStatus:
 *                   type: array
 *                   description: List of button statuses.
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                         description: Unique ID of the button status entry.
 *                       status:
 *                         type: string
 *                         example: "enabled"
 *                         description: Current status of the withdrawal button.
 *       204:
 *         description: No withdrawal button status found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No button status found."
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong, please try again."
 */