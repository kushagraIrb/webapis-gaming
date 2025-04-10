/**
 * @swagger
 * /api/deposit/history:
 *   get:
 *     summary: Fetch deposit history for a user
 *     description: Fetch the deposit history with pagination and total count for a user. The user ID is passed as a URL parameter.
 *     tags:
 *       - Deposit
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The page number for pagination (default is 1).
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page (default is 10).
 *     responses:
 *       200:
 *         description: Successfully fetched deposit history with pagination and total count.
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
 *                       deposit_id:
 *                         type: integer
 *                       deposit_screenshot:
 *                         type: string
 *                         example: "path/to/screenshot.jpg"
 *                       deposit_amount:
 *                         type: number
 *                         format: float
 *                         example: 1000
 *                       status:
 *                         type: integer
 *                         example: 1
 *                       created_date:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-01T12:00:00Z"
 *                 count:
 *                   type: integer
 *                   example: 50
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 perPage:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 5
 *       204:
 *         description: No deposit history found for the given user.
 *       400:
 *         description: Invalid request parameters or missing user ID.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/deposit/bank-account/{depositAmount}:
 *   get:
 *     summary: Fetch the admin bank account based on the deposit amount
 *     description: Fetch a bank account where the deposit amount falls within a defined range (`min_value` and `max_value`). If no account is found, it resets the `chosen_flag` and retries to find an available account.
 *     tags:
 *       - Deposit
 *     parameters:
 *       - in: path
 *         name: depositAmount
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *         description: The deposit amount used to fetch the appropriate bank account.
 *     responses:
 *       200:
 *         description: Successfully fetched the bank account details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: The unique identifier for the bank account.
 *                   example: 1
 *                 bank_name:
 *                   type: string
 *                   description: Name of the bank.
 *                   example: "XYZ Bank"
 *                 account_number:
 *                   type: string
 *                   description: Bank account number.
 *                   example: "1234567890"
 *                 min_value:
 *                   type: number
 *                   format: float
 *                   description: Minimum deposit value.
 *                   example: 500
 *                 max_value:
 *                   type: number
 *                   format: float
 *                   description: Maximum deposit value.
 *                   example: 1000
 *                 chosen_flag:
 *                   type: integer
 *                   description: Flag indicating if the account is chosen.
 *                   example: 1
 *                 status:
 *                   type: integer
 *                   description: Account status (1 for active, 0 for inactive).
 *                   example: 1
 *       204:
 *         description: No bank account found for the given deposit amount.
 *       400:
 *         description: Invalid deposit amount.
 *       500:
 *         description: Internal server error.
 *       503:
 *         description: Service unavailable or temporarily down.
 */

/**
 * @swagger
 * /api/deposit/save:
 *   post:
 *     summary: Save a deposit for a user
 *     description: Save deposit details for a user, including deposit amount, deposit date, bank owner name, and screenshot. The subFolder value is fixed to "deposit".
 *     tags:
 *       - Deposit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deposit_id:
 *                 type: integer
 *                 description: The unique identifier for the deposit (auto-generated if not provided).
 *               deposit_amount:
 *                 type: number
 *                 format: float
 *                 description: The total deposit amount.
 *                 example: 1000.50
 *               deposit_amount_step1:
 *                 type: number
 *                 format: float
 *                 description: The initial deposit amount (step 1).
 *                 example: 500.25
 *               deposit_date:
 *                 type: string
 *                 format: date-time
 *                 description: The date and time of the deposit.
 *                 example: "2025-01-01T12:00:00Z"
 *               bank_owner_name:
 *                 type: string
 *                 description: The name of the bank account owner.
 *                 example: "John Doe"
 *               deposit_screenshot:
 *                 type: string
 *                 format: binary
 *                 description: A screenshot or proof of the deposit.
 *                 example: "path/to/screenshot.jpg"
 *               subFolder:
 *                 type: string
 *                 description: A fixed value that specifies the sub-folder where deposit information will be stored.
 *                 example: "deposit"
 *                 enum: 
 *                   - "deposit"
 *     responses:
 *       200:
 *         description: Successfully saved the deposit details.
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
 *                   example: "Deposit saved successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     deposit_id:
 *                       type: integer
 *                       example: 123
 *                     deposit_amount:
 *                       type: number
 *                       format: float
 *                       example: 1000.50
 *                     deposit_amount_step1:
 *                       type: number
 *                       format: float
 *                       example: 500.25
 *                     deposit_date:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-01T12:00:00Z"
 *                     bank_owner_name:
 *                       type: string
 *                       example: "John Doe"
 *                     deposit_screenshot:
 *                       type: string
 *                       example: "path/to/screenshot.jpg"
 *                     subFolder:
 *                       type: string
 *                       example: "deposit"
 *       400:
 *         description: Invalid request parameters.
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
 *                   example: "Invalid input data."
 *       401:
 *         description: Unauthorized. User is not authenticated.
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
 *                   example: "Failed to save deposit due to server error."
 */

/**
 * @swagger
 * /api/deposit/save-log:
 *   post:
 *     summary: Save a deposit log for a user
 *     description: Saves deposit log details for a user, including deposit ID, amount, date, screenshot, and additional metadata. The subFolder value is fixed to "deposit_log".
 *     tags:
 *       - Deposit
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               deposit_id:
 *                 type: integer
 *                 description: The unique identifier for the deposit.
 *                 example: 123
 *               deposit_amount:
 *                 type: number
 *                 format: float
 *                 description: The total deposit amount.
 *                 example: 1000.50
 *               deposit_amount_step1:
 *                 type: number
 *                 format: float
 *                 description: The initial deposit amount (step 1).
 *                 example: 500.25
 *               deposit_date:
 *                 type: string
 *                 format: date-time
 *                 description: The date and time of the deposit.
 *                 example: "2025-01-01T12:00:00Z"
 *               ss_time_frame:
 *                 type: string
 *                 description: A formatted date or time frame related to the deposit.
 *                 example: "01 Jan 2025 - 12:00 PM"
 *               status:
 *                 type: string
 *                 description: The status of the deposit log (1=>Approved, 2=>Rejected).
 *                 example: "pending"
 *               subFolder:
 *                 type: string
 *                 description: A fixed value that specifies the sub-folder where deposit log will be stored.
 *                 example: "deposit_log"
 *                 enum: 
 *                   - "deposit_log"
 *               screenshot:
 *                 type: string
 *                 format: binary
 *                 description: A screenshot or proof of the deposit log.
 *                 example: "path/to/screenshot.jpg"
 *     responses:
 *       200:
 *         description: Successfully saved the deposit log.
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
 *                   example: "Deposit log saved successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     deposit_id:
 *                       type: integer
 *                       example: 123
 *                     deposit_amount:
 *                       type: number
 *                       format: float
 *                       example: 1000.50
 *                     deposit_amount_step1:
 *                       type: number
 *                       format: float
 *                       example: 500.25
 *                     deposit_date:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-01T12:00:00Z"
 *                     ss_time_frame:
 *                       type: string
 *                       example: "01 Jan 2025 - 12:00 PM"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     screenshot:
 *                       type: string
 *                       example: "path/to/screenshot.jpg"
 *                     subFolder:
 *                       type: string
 *                       example: "deposit_log"
 *       400:
 *         description: Invalid request parameters.
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
 *                   example: "Invalid input data."
 *       401:
 *         description: Unauthorized. User is not authenticated.
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
 *                   example: "Failed to save deposit log due to server error."
 */