/**
 * @swagger
 * /api/home-slider:
 *   get:
 *     summary: "Fetch Home Slider images"
 *     description: "Retrieve a list of image filenames for the Home Slider section."
 *     tags:
 *       - Home Slider
 *     responses:
 *       200:
 *         description: "Home Slider images successfully retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 description: "Image filename"
 *               example:
 *                 - "bannerwork_03.png"
 *                 - "bannerwork_02.png"
 *                 - "bannerwork_01.png"
 *       500:
 *         description: "Internal server error"
 */