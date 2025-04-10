/**
 * @swagger
 * /api/contact-us:
 *   post:
 *     summary: "Submit a Contact Us form"
 *     description: "Send user inquiries through the Contact Us form, saving the details and sending an email notification."
 *     tags:
 *       - Contact Us
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contact_name
 *               - contact_email
 *               - contact_phone
 *               - contact_message
 *             properties:
 *               contact_name:
 *                 type: string
 *                 description: "Name of the person submitting the inquiry"
 *                 example: "John Doe"
 *               contact_email:
 *                 type: string
 *                 description: "Email address of the person submitting the inquiry"
 *                 example: "john.doe@example.com"
 *               contact_phone:
 *                 type: string
 *                 description: "Phone number of the person submitting the inquiry"
 *                 example: "+1234567890"
 *               contact_message:
 *                 type: string
 *                 description: "Message content of the inquiry"
 *                 example: "I would like to know more about your services."
 *     responses:
 *       200:
 *         description: "Inquiry successfully submitted"
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
 *                   example: "Your inquiry has been successfully submitted."
 *       400:
 *         description: "Invalid input data"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid input. Please check your data and try again."
 *       500:
 *         description: "Internal server error"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "An error occurred while processing your request. Please try again later."
 */