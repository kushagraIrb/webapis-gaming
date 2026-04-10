/**
 * @swagger
 * /swagger-test-matchid:
 *   get:
 *     tags:
 *       - Debug
 *     responses:
 *       200:
 *         description: Swagger working test
 */

/**
 * @swagger
 * /api/match-id/demo-sites:
 *   get:
 *     summary: Fetch demo sites listing
 *     description: Retrieve available demo sites with pagination. User authentication is required via JWT token.
 *     tags:
 *       - MatchID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page.
 *     responses:
 *       200:
 *         description: Demo sites fetched successfully.
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
 *                         example: 1
 *                       site_name:
 *                         type: string
 *                         example: "Demo Gaming Site"
 *                       site_logo:
 *                         type: string
 *                         example: "uploads/logo.png"
 *                       site_link:
 *                         type: string
 *                         example: "https://example.com"
 *                       site_info:
 *                         type: string
 *                         example: "Demo gaming platform"
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
 *                 message:
 *                   type: string
 *                   example: "Demo sites fetched successfully"
 *       401:
 *         description: Unauthorized. Invalid or missing token.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/match-id/get-id:
 *   post:
 *     summary: Create match ID request
 *     description: Allows authenticated users to request a match ID for a specific demo site with a requested amount.
 *     tags:
 *       - MatchID
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - site_id
 *               - requested_amount
 *             properties:
 *               site_id:
 *                 type: integer
 *                 example: 5
 *                 description: ID of the demo site.
 *               requested_amount:
 *                 type: number
 *                 example: 1000
 *                 description: Requested amount for match ID.
 *     responses:
 *       200:
 *         description: Match ID request submitted successfully.
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
 *                   example: "Match ID request submitted successfully"
 *       400:
 *         description: Bad request. Missing required fields.
 *       401:
 *         description: Unauthorized. Invalid or missing token.
 *       500:
 *         description: Internal server error.
 */