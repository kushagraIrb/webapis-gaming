/**
 * @swagger
 * /api/coin-flip/current-match:
 *   get:
 *     summary: "Get current live coin flip match"
 *     description: "Fetch the current live coin flip match data, including match details and status"
 *     tags:
 *       - Coin Flip
 *     responses:
 *       200:
 *         description: "Current coin flip match successfully retrieved"
 *       401:
 *         description: "Unauthorized access"
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/coin-flip/user-past-results:
 *   get:
 *     summary: "Get user's past coin flip results"
 *     description: "Retrieve the last 10 coin flip game results for the authenticated user, showing bet amount and whether the user won or lost."
 *     tags:
 *       - Coin Flip
 *     security:
 *       - bearerAuth: []  # Assuming you're using bearer token authentication
 *     responses:
 *       200:
 *         description: "User past results successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   bet_amount:
 *                     type: number
 *                     example: 100
 *                   result:
 *                     type: string
 *                     enum: [Win, Loss]
 *                     example: Win
 *                   inserted_date:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-04-14T15:42:12"
 *       401:
 *         description: "Unauthorized access"
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/coin-flip/user-bet-history:
 *   get:
 *     summary: "Get user's coin flip bet history"
 *     description: "Retrieve the latest 5 coin flip bets for the authenticated user. Includes amount, prediction, final match result, and whether the user won or lost."
 *     tags:
 *       - Coin Flip
 *     security:
 *       - bearerAuth: []  # Assuming you're using bearer token authentication
 *     responses:
 *       200:
 *         description: "User bet history successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                     example: 50
 *                   prediction:
 *                     type: string
 *                     enum: [Heads, Tails]
 *                     example: Heads
 *                   final_result:
 *                     type: string
 *                     enum: [Heads, Tails]
 *                     example: Heads
 *                   result:
 *                     type: string
 *                     enum: [Win, Loss]
 *                     example: Win
 *       401:
 *         description: "Unauthorized access"
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/coin-flip/save-bet:
 *   post:
 *     summary: "Place a coin flip bet"
 *     description: "Allows an authenticated user to place a bet on an active coin flip match. It checks for various conditions like match status, betting status, user balance, duplicate bets, and deducts wallet/bonus balance accordingly."
 *     tags:
 *       - Coin Flip
 *     security:
 *       - bearerAuth: []  # Assumes bearer token authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - match_id
 *               - prediction
 *               - minimum_betamount
 *               - bet_amount
 *             properties:
 *               match_id:
 *                 type: integer
 *                 example: 42
 *               prediction:
 *                 type: string
 *                 enum: [Heads, Tails]
 *                 example: Heads
 *               minimum_betamount:
 *                 type: number
 *                 example: 50
 *               bet_amount:
 *                 type: number
 *                 example: 100
 *     responses:
 *       200:
 *         description: "Coin Flip bet placed successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Coin Flip bet placed successfully!"
 *       401:
 *         description: "Unauthorized or invalid conditions (e.g. match over, insufficient funds)"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sorry! This match is already over. Money not deducted. Try again."
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error!"
 */

/**
 * @swagger
 * /api/coin-flip/create-winner:
 *   post:
 *     summary: "Process match result and distribute winnings"
 *     description: "This endpoint processes the results of an eligible coin flip match and distributes winnings to the winning users based on their bet predictions."
 *     tags:
 *       - Coin Flip
 *     security:
 *       - bearerAuth: []  # Assumes bearer token authentication
 *     responses:
 *       200:
 *         description: "Match result processed and winnings distributed successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Match result processed and winnings distributed."
 *       401:
 *         description: "Unauthorized or no eligible match to process"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No eligible match to process."
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error occurred while processing the match result."
 */

/**
 * @swagger
 * /api/limbo/history:
 *   get:
 *     summary: "Get paginated Limbo bet history for the logged-in user"
 *     description: "Returns the user's Limbo betting history, including bet status, win amount, wallet balance, and multipliers."
 *     tags:
 *       - Limbo
 *     security:
 *       - bearerAuth: []   # Uses bearer token authentication
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: "Page number for pagination"
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 10
 *         description: "Number of records to return per page"
 *     responses:
 *       200:
 *         description: "Limbo bet history retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 25
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 perPage:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       limbo_id:
 *                         type: integer
 *                         example: 101
 *                       bet_amount:
 *                         type: number
 *                         example: 50
 *                       target_multiplier:
 *                         type: number
 *                         format: float
 *                         example: 2.0
 *                       bet_multiplier:
 *                         type: number
 *                         format: float
 *                         example: 1.8
 *                       status:
 *                         type: string
 *                         enum: [Win, Loss]
 *                         example: "Win"
 *                       win_amount:
 *                         type: number
 *                         example: 75
 *                       wallet_amount:
 *                         type: number
 *                         example: 1200
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-08-28T10:00:00Z"
 *       401:
 *         description: "Unauthorized"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid user."
 *       404:
 *         description: "No bet history found"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No bet history found for this user."
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "An error occurred while fetching Limbo bet history."
 */