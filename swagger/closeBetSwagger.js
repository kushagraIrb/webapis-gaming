/**
 * @swagger
 * /api/close-bet:
 *   get:
 *     summary: Fetch close bet history
 *     description: Fetch the history of close bets with pagination support.
 *     tags:
 *       - Close Bet
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
 *         description: Successfully fetched close bet history.
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
 *                       id:
 *                         type: integer
 *                         example: 101
 *                       match_name:
 *                         type: string
 *                         example: "Team A vs Team B"
 *                       match_date:
 *                         type: string
 *                         format: date
 *                         example: "2024-02-15"
 *                       match_time:
 *                         type: string
 *                         format: time
 *                         example: "18:30:00"
 *                       match_title:
 *                         type: string
 *                         example: "Championship Finals"
 *                       match_address:
 *                         type: string
 *                         example: "Stadium XYZ, City"
 *                       win_ratio:
 *                         type: number
 *                         example: 1.85
 *                       max_bet:
 *                         type: integer
 *                         example: 5000
 *                       userBy:
 *                         type: string
 *                         example: "User123"
 *                       modified:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-14T12:45:00Z"
 *                       isLive:
 *                         type: integer
 *                         example: 1
 *                       status:
 *                         type: integer
 *                         example: 1
 *                 count:
 *                   type: integer
 *                   example: 150
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 perPage:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 15
 *                 message:
 *                   type: string
 *                   example: "Close bet matches fetched successfully"
 *       404:
 *         description: No close bets found.
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
 *                   example: "No matches available"
 *                 total:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: array
 *                   example: []
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
 *                   example: "An error occurred while fetching close bet matches"
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */