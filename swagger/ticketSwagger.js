/**
 * @swagger
 * /api/ticket/close-ticket/{ticket_id}:
 *   put:
 *     summary: Close a ticket by ticket ID
 *     description: >
 *       Closes all support ticket rows associated with the token number of the provided `ticket_id`.
 *       This is useful when a ticket has multiple entries, and all need to be marked as Closed together.
 *       Closing a ticket means updating the status to `'Close'` for all entries sharing the same token number.
 *     tags:
 *       - Ticket
 *     parameters:
 *       - in: path
 *         name: ticket_id
 *         required: true
 *         description: Unique ID of the ticket to close (used to find related token_no).
 *         schema:
 *           type: integer
 *           example: 12345
 *     responses:
 *       200:
 *         description: Successfully closed the ticket and its related entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 closedCount:
 *                   type: integer
 *                   example: 3
 *                 message:
 *                   type: string
 *                   example: "Ticket closed successfully."
 *       400:
 *         description: Bad request. Ticket ID missing or invalid.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       404:
 *         description: Ticket not found.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/ticket/history:
 *   get:
 *     summary: Fetch token history for a user
 *     description: Retrieve the token history grouped by token number for a user. The user ID is inferred from the session or token.
 *     tags:
 *       - Ticket
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
 *         description: Successfully fetched token history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       reason:
 *                         type: string
 *                         example: "Password Reset"
 *                       id:
 *                         type: integer
 *                         example: 123
 *                       token_no:
 *                         type: string
 *                         example: "TOKEN12345"
 *                       issues:
 *                         type: integer
 *                         example: 1
 *                       remarks:
 *                         type: string
 *                         example: "Requested password reset"
 *                       attachment:
 *                         type: string
 *                         example: "path/to/attachment.png"
 *                       status:
 *                         type: string
 *                         example: "Resolved"
 *                       modified:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-12T14:30:00Z"
 *                 total_count:
 *                   type: integer
 *                   example: 50
 *                 current_page:
 *                   type: integer
 *                   example: 1
 *                 per_page:
 *                   type: integer
 *                   example: 10
 *                 message:
 *                   type: string
 *                   example: "Token history fetched successfully"
 *       204:
 *         description: No token history found for the given user.
 *       400:
 *         description: Invalid request parameters or missing user ID.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/ticket/save:
 *   post:
 *     summary: Create a new support ticket
 *     description: Allows a user to create a new support ticket by providing issue type, remarks, and an optional screenshot or attachment.
 *     tags:
 *       - Ticket
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               issues:
 *                 type: integer
 *                 description: The issue type the ticket is related to (e.g., 1 for "Withdrawal Issues").
 *                 example: 1
 *               remarks:
 *                 type: string
 *                 description: The remarks or description for the ticket.
 *                 example: "I am unable to withdraw funds from my account."
 *               attachment:
 *                 type: string
 *                 description: The path or filename of the optional attachment (e.g., a screenshot).
 *                 example: "path/to/screenshot.png"
 *     responses:
 *       201:
 *         description: Successfully created the support ticket.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ticket created successfully, token generated."
 *                 token_no:
 *                   type: string
 *                   example: "TOKEN123456"
 *       400:
 *         description: Bad request. The input parameters are invalid or missing.
 *       401:
 *         description: Unauthorized. User is not authenticated or session has expired.
 *       500:
 *         description: Internal server error. There was an issue creating the ticket.
 *       422:
 *         description: Unprocessable Entity. Missing required fields (e.g., issues, remarks).
 */

/**
 * @swagger
 * /api/ticket/reply:
 *   post:
 *     summary: Reply to a support ticket
 *     description: Allows a user to reply to an existing support ticket with remarks and an optional attachment.
 *     tags:
 *       - Ticket
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token_no:
 *                 type: string
 *                 description: The unique token number of the ticket.
 *                 example: "7821552"
 *               status:
 *                 type: string
 *                 description: The status of the ticket after the reply.
 *                 example: "Processing"
 *               issues_id:
 *                 type: integer
 *                 description: The ID of the issue related to the ticket.
 *                 example: 1
 *               editor:
 *                 type: string
 *                 description: The reply message for the ticket.
 *                 example: "Hi, please check my issue as shown in the attachment."
 *               subFolder:
 *                 type: string
 *                 description: The folder where attachments should be stored.
 *                 example: "tickets"
 *               attachment:
 *                 type: string
 *                 description: The path or filename of the optional attachment.
 *                 example: "uploads/tickets/reply_screenshot.png"
 *     responses:
 *       201:
 *         description: Successfully added the reply to the support ticket.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Reply added successfully."
 *       400:
 *         description: Bad request. The input parameters are invalid or missing.
 *       401:
 *         description: Unauthorized. User is not authenticated or session has expired.
 *       500:
 *         description: Internal server error. There was an issue saving the reply.
 *       422:
 *         description: Unprocessable Entity. Missing required fields (e.g., token_no, issues, editor).
 */

/**
 * @swagger
 * /api/ticket/reply-history:
 *   post:
 *     summary: Get support ticket data by token number
 *     description: Retrieves detailed information about a specific support ticket based on the provided token number.
 *     tags:
 *       - Ticket
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token_no:
 *                 type: string
 *                 description: The unique token number of the ticket.
 *                 example: "7821552"
 *     responses:
 *       200:
 *         description: Successfully retrieved ticket details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       reason:
 *                         type: string
 *                         description: The reason associated with the support ticket.
 *                         example: "Payment Issue"
 *                       token_no:
 *                         type: string
 *                         description: The unique token number of the ticket.
 *                         example: "7821552"
 *                       id:
 *                         type: integer
 *                         description: The unique ID of the ticket entry.
 *                         example: 101
 *                       read_msg:
 *                         type: integer
 *                         description: Indicates if the message has been read.
 *                         example: 1
 *                       attachment:
 *                         type: string
 *                         description: The path or filename of any attachment related to the ticket.
 *                         example: "uploads/tickets/screenshot.png"
 *                       remarks:
 *                         type: string
 *                         description: The remarks added to the ticket.
 *                         example: "Looking into the issue."
 *                       status:
 *                         type: string
 *                         description: The current status of the ticket.
 *                         example: "Processing"
 *                       modified:
 *                         type: string
 *                         format: date-time
 *                         description: The last modified timestamp of the ticket.
 *                         example: "2024-02-14T10:30:00Z"
 *                       userBy:
 *                         type: integer
 *                         description: The ID of the user who created the ticket.
 *                         example: 25
 *                       admin_id:
 *                         type: integer
 *                         description: The ID of the admin handling the ticket.
 *                         example: 3
 *                       first_name:
 *                         type: string
 *                         description: The first name of the user who created the ticket.
 *                         example: "John"
 *                       last_name:
 *                         type: string
 *                         description: The last name of the user who created the ticket.
 *                         example: "Doe"
 *       400:
 *         description: Bad request. The input parameters are invalid or missing.
 *       401:
 *         description: Unauthorized. User is not authenticated or session has expired.
 *       404:
 *         description: No ticket found for the given token number.
 *       500:
 *         description: Internal server error. There was an issue retrieving the ticket data.
 */