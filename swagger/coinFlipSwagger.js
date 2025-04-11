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