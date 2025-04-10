/**
 * @swagger
 * /api/account/history:
 *   get:
 *     summary: Fetch account history for a user
 *     description: Retrieve the account transaction history or total count for a user with optional pagination. The user ID is inferred from the session or token.
 *     tags:
 *       - Account
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
 *         description: Successfully fetched account history or total count.
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
 *                       account_id:
 *                         type: integer
 *                         example: 1
 *                       transaction_type:
 *                         type: string
 *                         example: "Credit"
 *                       amount:
 *                         type: number
 *                         format: float
 *                         example: 1000.50
 *                       description:
 *                         type: string
 *                         example: "Deposit into wallet"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-01T12:00:00Z"
 *                 total_count:
 *                   type: integer
 *                   example: 100
 *                 current_page:
 *                   type: integer
 *                   example: 1
 *                 per_page:
 *                   type: integer
 *                   example: 10
 *                 total_pages:
 *                   type: integer
 *                   example: 10
 *                 message:
 *                   type: string
 *                   example: "Account history fetched successfully"
 *       204:
 *         description: No account history found for the given user.
 *       400:
 *         description: Invalid request parameters or missing user ID.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/account/change-primary:
 *   post:
 *     summary: Change the primary account for a user
 *     description: Update the primary account for a user by setting the specified account ID as the primary. The user ID is inferred from the JWT token.
 *     tags:
 *       - Account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: body
 *         name: body
 *         required: true
 *         description: The account ID to be set as primary.
 *         schema:
 *           type: object
 *           required:
 *             - accountId
 *           properties:
 *             accountId:
 *               type: integer
 *               example: 123
 *               description: The ID of the account to be set as primary.
 *     responses:
 *       200:
 *         description: Primary account updated successfully.
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
 *                   example: "Primary account updated successfully"
 *       400:
 *         description: Bad request. Account ID is missing or invalid.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       404:
 *         description: Account not found for the given user.
 *       500:
 *         description: Internal server error.
 */