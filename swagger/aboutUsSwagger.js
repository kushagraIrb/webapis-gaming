/**
 * @swagger
 * /api/about-us:
 *   get:
 *     summary: "Fetch About Us data"
 *     description: "Retrieve the About Us information from the database."
 *     tags:
 *       - About Us
 *     responses:
 *       200:
 *         description: "About Us data successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: "The ID of the page"
 *                 title:
 *                   type: string
 *                   description: "The title of the page"
 *                 content:
 *                   type: string
 *                   description: "The content of the About Us page"
 *       500:
 *         description: "Internal server error"
 */