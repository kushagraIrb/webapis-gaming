/**
 * @swagger
 * /api/blogs:
 *   get:
 *     summary: "Fetch all blogs"
 *     description: "Retrieve a list of all blogs available with pagination"
 *     tags:
 *       - Blogs
 *     parameters:
 *       - name: page
 *         in: query
 *         description: "Page number for pagination"
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: perPage
 *         in: query
 *         description: "Number of blogs per page"
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: "List of blogs successfully retrieved"
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
 *                       title:
 *                         type: string
 *                         example: "Blog Title"
 *                       content:
 *                         type: string
 *                         example: "Blog content here."
 *                       created_at:
 *                         type: string
 *                         example: "2025-02-14T12:00:00Z"
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
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: "An error occurred"
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */

/**
 * @swagger
 * /api/blogs/details/{slug}:
 *   get:
 *     summary: "Fetch blog details"
 *     description: "Retrieve detailed information about a specific blog"
 *     tags:
 *       - Blogs
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         description: "slug of the blog to fetch details for"
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Blog details successfully retrieved"
 *       404:
 *         description: "Blog not found"
 *       500:
 *         description: "Internal server error"
 */