/**
 * @swagger
 * /api/live-bet:
 *   get:
 *     summary: "Get live betting information"
 *     description: "Fetch live betting data, including active bets and match information"
 *     tags:
 *       - Live Bet
 *     responses:
 *       200:
 *         description: "Live bet information successfully retrieved"
 *       401:
 *         description: "Unauthorized access"
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/live-bet/{id}:
 *   get:
 *     summary: "Get match details by bet ID"
 *     description: "Retrieve detailed information about a match by its associated bet ID"
 *     tags:
 *       - Live Bet
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: "ID of the bet to fetch match details"
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Match details successfully retrieved"
 *       404:
 *         description: "Bet not found"
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/live-bet/save:
 *   post:
 *     summary: "Save a new bet"
 *     description: "Submit a new bet for a live match"
 *     tags:
 *       - Live Bet
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               match_id:
 *                 type: string
 *                 description: "ID of the match to place the bet on"
 *               team_value:
 *                 type: string
 *                 description: "Selected team ID for the bet"
 *               toss_id:
 *                 type: string
 *                 description: "ID of the toss result if applicable"
 *               bet_amount:
 *                 type: number
 *                 format: float
 *                 description: "Amount of money being wagered"
 *               minimum_betamount:
 *                 type: number
 *                 format: float
 *                 description: "Minimum bet amount allowed"
 *     responses:
 *       200:
 *         description: "Bet successfully placed or validation message returned"
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
 *                   example: "Bet placed successfully!"
 *                 bet:
 *                   type: object
 *                   description: "Details of the placed bet"
 *       400:
 *         description: "Invalid request body or parameters"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid bet amount!"
 *       401:
 *         description: "Unauthorized access"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized! Token is invalid or missing."
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
 * /api/live-bet/extra-time-list:
 *   get:
 *     summary: "Get the list of live matches with extra time"
 *     description: "Retrieve a list of live matches that have upcoming extra time"
 *     tags:
 *       - Live Bet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Successfully retrieved list of extra time matches"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   match_name:
 *                     type: string
 *                     description: "Name of the match"
 *                   match_date:
 *                     type: string
 *                     format: date
 *                     description: "Date of the match"
 *                   match_time:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: "List of match times in HH:mm format"
 *                   win_ratio:
 *                     type: array
 *                     items:
 *                       type: number
 *                     description: "Winning ratio for the match"
 *       401:
 *         description: "Unauthorized. Please log in."
 *       500:
 *         description: "Internal server error"
 */

/**
 * @swagger
 * /api/live-bet/home-listing:
 *   get:
 *     summary: "Get the list of live home matches"
 *     description: "Retrieve a list of upcoming live matches for the home page"
 *     tags:
 *       - Live Bet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Successfully retrieved list of home live matches"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: "Match ID"
 *                   encrypted_id:
 *                     type: string
 *                     description: "Encrypted match ID"
 *                   team_one_name:
 *                     type: string
 *                     description: "Name of the first team"
 *                   team_one_logo:
 *                     type: string
 *                     description: "Logo URL of the first team"
 *                   team_two_name:
 *                     type: string
 *                     description: "Name of the second team"
 *                   team_two_logo:
 *                     type: string
 *                     description: "Logo URL of the second team"
 *                   match_name:
 *                     type: string
 *                     description: "Name of the match"
 *                   match_date:
 *                     type: string
 *                     format: date
 *                     description: "Date of the match"
 *                   match_time:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: "List of match times in HH:mm format"
 *                   match_title:
 *                     type: string
 *                     description: "Title of the match"
 *                   match_address:
 *                     type: string
 *                     description: "Address where the match is held"
 *                   win_ratio:
 *                     type: number
 *                     description: "Winning ratio for the match"
 *                   max_bet:
 *                     type: number
 *                     description: "Maximum bet allowed for the match"
 *                   isLive:
 *                     type: boolean
 *                     description: "Indicates if the match is live"
 *       401:
 *         description: "Unauthorized. Please log in."
 *       500:
 *         description: "Internal server error"
 */