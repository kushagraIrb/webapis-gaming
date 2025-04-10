/**
 * @swagger
 * /api/maintenance:
 *   get:
 *     summary: "Fetch Website Status"
 *     description: "Retrieve the current website status (on/off) from the database."
 *     tags:
 *       - Website Status
 *     responses:
 *       200:
 *         description: "Website status successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: "The current status of the website (on/off)"
 *                   example: "on"
 *       500:
 *         description: "Internal server error"
 */