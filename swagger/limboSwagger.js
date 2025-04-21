/**
 * @swagger
 * /api/limbo/bet-details:
 *   get:
 *     summary: "Fetch user's Limbo bet history"
 *     description: "Retrieve the latest 10 Limbo bets for the logged-in user based on session token"
 *     tags:
 *       - Limbo
 *     parameters:
 *       - in: cookie
 *         name: session_token
 *         required: true
 *         description: Base64 encoded session token to identify the user
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Bets successfully retrieved"
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
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-04-18T14:20:00Z"
 *                       bet_amount:
 *                         type: number
 *                         format: float
 *                         example: 50
 *                       target_multiplier:
 *                         type: number
 *                         format: float
 *                         example: 2.5
 *                       payout:
 *                         type: number
 *                         format: float
 *                         example: 125
 *                       bet_multiplier:
 *                         type: number
 *                         format: float
 *                         example: 2.5
 *                 message:
 *                   type: string
 *                   example: "Bets fetched successfully"
 *       401:
 *         description: "Session token missing or invalid"
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
 *                   example: "Session token missing"
 *       404:
 *         description: "No user found or no bets found"
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
 *                   example: "No user found for session token"
 *       500:
 *         description: "Internal server error"
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
 *                   example: "An error occurred while fetching bet details"
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 */

/**
 * @swagger
 * /api/limbo/place-bet:
 *   post:
 *     summary: "Place a Limbo bet"
 *     description: |
 *       Allows the logged-in user to place a Limbo bet.
 *       
 *       - **bet_type = 1 (Manual Bet)**:  
 *         Fields to be given: `bet_type`, `target_multiplier`, `win_chance`, `bet_amount`, `profit_on_win`
 *       
 *       - **bet_type = 2 (Auto Bet)**:  
 *         Fields to be given: `bet_type`, `target_multiplier`, `win_chance`, `bet_amount`, `number_of_bets`, `on_wins`, `on_loss`, `stop_on_profit`, `stop_on_loss`
 *     tags:
 *       - Limbo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bet_type
 *               - target_multiplier
 *               - win_chance
 *               - bet_amount
 *             properties:
 *               bet_type:
 *                 type: integer
 *                 enum: [1, 2]
 *                 description: "1 for Manual bet, 2 for Auto bet"
 *                 example: 1
 *               target_multiplier:
 *                 type: number
 *                 format: float
 *                 example: 2.5
 *               win_chance:
 *                 type: number
 *                 format: float
 *                 example: 40
 *               bet_amount:
 *                 type: number
 *                 format: float
 *                 example: 50
 *               # Fields for Manual Bet (bet_type = 1)
 *               profit_on_win:
 *                 type: number
 *                 format: float
 *                 example: 75
 *                 description: "Required only for bet_type = 1"
 *               # Fields for Auto Bet (bet_type = 2)
 *               number_of_bets:
 *                 type: integer
 *                 example: 10
 *                 description: "Required only for bet_type = 2"
 *               on_wins:
 *                 type: number
 *                 format: float
 *                 example: 1.5
 *                 description: "Multiplier to increase bet amount after win (Required for bet_type = 2)"
 *               on_loss:
 *                 type: number
 *                 format: float
 *                 example: 2
 *                 description: "Multiplier to increase bet amount after loss (Required for bet_type = 2)"
 *               stop_on_profit:
 *                 type: number
 *                 format: float
 *                 example: 500
 *                 description: "Stop betting after reaching this profit (Required for bet_type = 2)"
 *               stop_on_loss:
 *                 type: number
 *                 format: float
 *                 example: 200
 *                 description: "Stop betting after reaching this loss (Required for bet_type = 2)"
 *     responses:
 *       200:
 *         description: "Bet placed successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Win"
 *                 data:
 *                   type: string
 *                   example: "Bet placed successfully"
 *                 bet_multiplier:
 *                   type: number
 *                   format: float
 *                   example: 2.7
 *       400:
 *         description: "Required fields missing or invalid"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Required fields missing."
 *                 missing_fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Target Multiplier", "Bet Amount"]
 *       401:
 *         description: "Unauthorized - user ID not found"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: "Invalid user."
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Error"
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */