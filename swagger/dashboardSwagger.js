/**
 * @swagger
 * /api/user-dashboard:
 *   get:
 *     summary: "Get user dashboard data"
 *     description: >
 *       Retrieve detailed user statistics including wallet balance, withdrawals, deposits, bets played,
 *       total profit, win percentage (last 10 days), and recent wallet history.
 *     tags:
 *       - User Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Dashboard data successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalBalance:
 *                   type: number
 *                   example: 150.75
 *                 totalWithdrawal:
 *                   type: number
 *                   example: 50
 *                 totalDeposit:
 *                   type: number
 *                   example: 200
 *                 totalPlayedAmount:
 *                   type: number
 *                   example: 350.25
 *                 totalPlayedCount:
 *                   type: integer
 *                   example: 23
 *                 totalProfit:
 *                   type: number
 *                   example: 100.5
 *                 totalBonusCoins:
 *                   type: string
 *                   example: "Coming Soon!"
 *                 totalBetsWin:
 *                   type: number
 *                   example: 10
 *                 walletHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2025-07-18"
 *                       total_amount:
 *                         type: number
 *                         example: 150.75
 *       401:
 *         description: "Unauthorized access"
 *       500:
 *         description: "Internal server error"
 */