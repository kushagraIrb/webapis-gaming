/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: "Fetch all events"
 *     description: "Retrieve a list of all events available with pagination details"
 *     tags:
 *       - Events
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
 *         description: "Number of items per page"
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: "List of events successfully retrieved"
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
 *                       event_name:
 *                         type: string
 *                         example: "Football Match"
 *                       event_date:
 *                         type: string
 *                         format: date
 *                         example: "2025-02-15"
 *                       location:
 *                         type: string
 *                         example: "Stadium A"
 *                 count:
 *                   type: integer
 *                   example: 100
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 perPage:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 10
 *                 message:
 *                   type: string
 *                   example: "Events fetched successfully"
 *       500:
 *         description: "Internal server error"
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
 *                   example: "An error occurred while fetching events"
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */

/**
 * @swagger
 * /api/events/details/{id}:
 *   get:
 *     summary: "Fetch event details"
 *     description: "Retrieve detailed information about a specific event"
 *     tags:
 *       - Events
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: "ID of the event to fetch details for"
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Event details successfully retrieved"
 *       404:
 *         description: "Event not found"
 *       500:
 *         description: "Internal server error"
 */