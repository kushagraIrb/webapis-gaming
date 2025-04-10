/**
 * @swagger
 * /api/bet-list:
 *   get:
 *     summary: Fetch user's bet list
 *     description: Retrieve a paginated list of bets placed by the user.
 *     tags:
 *       - Bets
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
 *         description: Successfully fetched bet list.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       bet_id:
 *                         type: integer
 *                       match_id:
 *                         type: integer
 *                       team_id:
 *                         type: integer
 *                       match_name:
 *                         type: string
 *                       match_date:
 *                         type: string
 *                         format: date
 *                       match_time:
 *                         type: array
 *                         items:
 *                           type: string
 *                           format: time
 *                       win_ratio:
 *                         type: array
 *                         items:
 *                           type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: integer
 *                       wallet_amount:
 *                         type: number
 *                       bonus_amount:
 *                         type: number
 *                       winSt:
 *                         type: string
 *                       matchTimeStatus:
 *                         type: string
 *                       winRatio:
 *                         type: string
 *                 message:
 *                   type: string
 *       204:
 *         description: No bets found.
 *       500:
 *         description: Internal server error.
 */