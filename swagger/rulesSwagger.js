/**
 * @swagger
 * /api/rules:
 *   get:
 *     summary: "Fetch Rules data"
 *     description: "Retrieve the Rules information from the database."
 *     tags:
 *       - Rules
 *     responses:
 *       200:
 *         description: "Rules data successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: "The ID of the rules entry"
 *                 title:
 *                   type: string
 *                   description: "The title of the rules section"
 *                 content:
 *                   type: string
 *                   description: "The content of the rules section"
 *       500:
 *         description: "Internal server error"
 */