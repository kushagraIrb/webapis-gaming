/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get a list of notifications for the user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: Successfully retrieved notification list
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */

/**
 * @swagger
 * /api/notifications/user-count:
 *   get:
 *     summary: Get the count of unread notifications for the user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: Successfully retrieved unread notification count
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */

/**
 * @swagger
 * /api/notifications/update-status:
 *   get:
 *     summary: Update the viewed status of notifications for the user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: Successfully updated notification status
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */