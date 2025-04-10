/**
 * @swagger
 * /api/wallet/history:
 *   get:
 *     summary: Fetch wallet transaction history
 *     description: Fetch the wallet transaction history for a user with optional pagination. The user ID is derived from the JWT token in the `Authorization` header.
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer <JWT_TOKEN>
 *         description: The JWT token for authentication, provided as `Bearer <JWT_TOKEN>`.
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
 *         description: Successfully fetched wallet transaction history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       transaction_id:
 *                         type: integer
 *                         example: 12345
 *                       d_w_id:
 *                         type: integer
 *                         example: 54321
 *                       bet_id:
 *                         type: integer
 *                         example: 6789
 *                       limbo_id:
 *                         type: integer
 *                         example: null
 *                       win_id:
 *                         type: integer
 *                         example: 456
 *                       match_id:
 *                         type: integer
 *                         example: 987
 *                       coin_match_id:
 *                         type: integer
 *                         example: null
 *                       credit_amount:
 *                         type: number
 *                         format: float
 *                         example: 500.00
 *                       debit_amount:
 *                         type: number
 *                         format: float
 *                         example: 200.00
 *                       total_amount:
 *                         type: number
 *                         format: float
 *                         example: 300.00
 *                       type:
 *                         type: string
 *                         example: "Deposit"
 *                       t_status:
 *                         type: string
 *                         example: "Completed"
 *                       transaction_date:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-14T12:30:45Z"
 *                       cancel_charge:
 *                         type: number
 *                         format: float
 *                         example: 5.00
 *                       charge_amt_cut:
 *                         type: number
 *                         format: float
 *                         example: 10.00
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
 *                 message:
 *                   type: string
 *                   example: "Wallet history fetched successfully"
 *       204:
 *         description: No wallet transaction history found.
 *       400:
 *         description: Invalid request parameters or missing user ID.
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
 *                   example: "User ID is required!"
 *       401:
 *         description: Unauthorized. JWT token is missing or invalid.
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
 *                   example: "Unauthorized access."
 *       500:
 *         description: Internal server error.
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
 *                   example: "An error occurred"
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 */

/**
 * @swagger
 * /api/wallet/total-amount:
 *   get:
 *     summary: Fetch the total wallet amount for a user
 *     description: Retrieve the total wallet amount for a user from their transaction history.
 *     tags:
 *       - Wallet
 *     responses:
 *       200:
 *         description: Successfully fetched the total wallet amount.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalWalletAmount:
 *                   type: number
 *                   format: float
 *                   example: 5000.75
 *                 message:
 *                   type: string
 *                   example: "Total wallet amount fetched successfully"
 *       400:
 *         description: Bad request, such as missing user ID.
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
 *                   example: "User ID is required!"
 *       401:
 *         description: Unauthorized access.
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
 *                   example: "Unauthorized access"
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
 *                   example: "An error occurred"
 *                 error:
 *                   type: string
 *                   example: "Error details"
 */