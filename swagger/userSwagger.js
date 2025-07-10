/**
 * @swagger
 * /api/users/check-name:
 *   post:
 *     summary: Check if user name combination exists and suggest alternatives
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: "John"
 *                 description: User's first name
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *                 description: User's last name (optional)
 *             required:
 *               - first_name
 *     responses:
 *       200:
 *         description: Name is available or suggestions provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alreadyExists:
 *                   type: boolean
 *                   example: true
 *                 msg:
 *                   type: string
 *                   example: A user with this name already exists.
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       first_name:
 *                         type: string
 *                         example: "JohnDoe8712"
 *                       last_name:
 *                         type: string
 *                         example: "Doe_8712"
 *                   example:
 *                     - first_name: "John"
 *                       last_name: "Doe34"
 *                     - first_name: "John"
 *                       last_name: "Doe_56"
 *                     - first_name: "John"
 *                       last_name: "Doe_9123"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: "First name is required"
 *                       param:
 *                         type: string
 *                         example: "first_name"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while checking the name"
 */

/**
 * @swagger
 * /api/users/update-name:
 *   put:
 *     summary: Update user's first and last name
 *     description: >
 *       Updates the `first_name` and `last_name` of an existing user identified by `user_id`.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - first_name
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 101
 *               first_name:
 *                 type: string
 *                 example: Alicia
 *               last_name:
 *                 type: string
 *                 example: Johnson
 *     responses:
 *       200:
 *         description: Name updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Name updated successfully.
 *                 status:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: user_id and first_name are required.
 *       404:
 *         description: User not found or update failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: User not found or name not updated.
 *                 status:
 *                   type: boolean
 *                   example: false
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/users/send-otp:
 *   post:
 *     summary: Send OTP to user's phone
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *                 description: User's email address
 *               phone:
 *                 type: string
 *                 example: "1234567890"
 *                 description: User's phone number
 *             required:
 *               - phone
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "OTP sent successfully to the provided phone number"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while sending the OTP"
 */

/**
 * @swagger
 * /api/users/fetch-state:
 *   get:
 *     summary: Fetch user's state information
 *     tags:
 *       - Users
 *     parameters:
 *       - in: query
 *         name: pincode
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional pincode to fetch state information for a specific area
 *     responses:
 *       200:
 *         description: State information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 state:
 *                   type: string
 *                   example: "California"
 *                 message:
 *                   type: string
 *                   example: "State information retrieved successfully"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while processing your request"
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: "kush"
 *                 description: User's first name
 *               last_name:
 *                 type: string
 *                 example: "dev"
 *                 description: User's last name
 *               phone:
 *                 type: integer
 *                 example: 8923894749
 *                 description: User's phone number
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "kushagra.agrawal@logzerotechnologies.com"
 *                 description: User's email address
 *               pincode:
 *                 type: integer
 *                 example: 201301
 *                 description: User's area pincode
 *               password:
 *                 type: string
 *                 example: "1qaz1qaz"
 *                 description: User's password
 *               is_eighteen:
 *                 type: boolean
 *                 example: true
 *                 description: Indicates if the user is 18 years or older
 *               is_verified:
 *                 type: boolean
 *                 example: true
 *                 description: Indicates if the user is verified
 *               isRefer:
 *                 type: boolean
 *                 example: true
 *                 description: Indicates if the user was referred
 *               otp:
 *                 type: integer
 *                 example: 4329
 *                 description: One-time password for verification
 *             required:
 *               - first_name
 *               - last_name
 *               - phone
 *               - email
 *               - pincode
 *               - password
 *               - is_eighteen
 *               - is_verified
 *               - isRefer
 *               - otp
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Validation error occurred"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while registering the user"
 */

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "8923894749"
 *                 description: User's phone number
 *               password:
 *                 type: string
 *                 example: "1qaz1qaz"
 *                 description: User's password
 *             required:
 *               - phone
 *               - password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid phone or password"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while processing your request"
 */

/**
 * @swagger
 * /api/users/details:
 *   post:
 *     summary: Get user details based on JWT token
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Successfully retrieved user details
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */

/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: Change user's password
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: "1qaz1qaz"
 *                 description: The new password
 *               conf_password:
 *                 type: string
 *                 example: "1qaz1qaz"
 *                 description: Confirmation of the new password
 *             required:
 *               - password
 *               - conf_password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Validation error occurred"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while changing the password"
 */

/**
 * @swagger
 * /api/users/dashboard:
 *   post:
 *     summary: Get user dashboard data
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/users/edit-profile:
 *   post:
 *     summary: Edit user profile
 *     description: Update user profile information including first name, last name, and profile image.
 *     tags:
 *       - Users
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: first_name
 *         type: string
 *         required: true
 *         description: User's first name
 *       - in: formData
 *         name: last_name
 *         type: string
 *         required: true
 *         description: User's last name
 *       - in: formData
 *         name: subFolder
 *         type: string
 *         required: true
 *         description: Folder name where profile images will be saved (fixed to "profile")
 *         default: "profile"
 *         readOnly: true
 *       - in: formData
 *         name: profile_image
 *         type: file
 *         required: false
 *         description: Profile image (optional)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *       400:
 *         description: Bad request if validation fails
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Validation error occurred"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while updating the profile"
 */

/**
 * @swagger
 * /api/users/add-account:
 *   post:
 *     summary: Add user account
 *     description: Add account information for a user, including bank details, UPI ID, and digital wallet numbers.
 *     tags:
 *       - Account
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: accountDetails
 *         description: Account information to be added.
 *         schema:
 *           type: object
 *           required:
 *             - holder_name
 *             - account
 *             - ifsc_code
 *             - bank_name
 *             - account_type
 *             - upi_id
 *             - phone_pay
 *             - g_pay
 *             - paytm
 *           properties:
 *             holder_name:
 *               type: string
 *               description: Account holder's name
 *             account:
 *               type: string
 *               description: Bank account number
 *             re_account:
 *               type: string
 *               description: Re-entered bank account number (for validation)
 *             ifsc_code:
 *               type: string
 *               description: IFSC code of the bank
 *             bank_name:
 *               type: string
 *               description: Name of the bank
 *             account_type:
 *               type: string
 *               enum: [Savings, Current]
 *               description: Type of bank account
 *             upi_id:
 *               type: string
 *               description: UPI ID for transactions
 *             phone_pay:
 *               type: string
 *               description: PhonePe number
 *             g_pay:
 *               type: string
 *               description: Google Pay number
 *             paytm:
 *               type: string
 *               description: Paytm number
 *     responses:
 *       200:
 *         description: Account added successfully
 *         schema:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               example: Account information added successfully.
 *       400:
 *         description: Bad request if validation fails
 *         schema:
 *           type: object
 *           properties:
 *             errors:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   field:
 *                     type: string
 *                     description: The field that caused the error
 *                   message:
 *                     type: string
 *                     description: The validation error message
 *       500:
 *         description: Internal server error
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               example: An error occurred while adding the account.
 */

/**
 * @swagger
 * /api/users/get-account-details:
 *   get:
 *     summary: Get account details of a user
 *     description: Fetch account details for the logged-in user based on the user ID extracted from the JWT token.
 *     tags:
 *       - Account
 *     responses:
 *       200:
 *         description: Successfully retrieved the account details.
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
 *                   example: "Account details retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ac_id:
 *                       type: integer
 *                       example: 1
 *                       description: Account ID
 *                     user_id:
 *                       type: integer
 *                       example: 123
 *                       description: User ID
 *                     bank_name:
 *                       type: string
 *                       example: "Bank of XYZ"
 *                       description: Name of the bank
 *                     account_number:
 *                       type: string
 *                       example: "9876543210"
 *                       description: The account number
 *                     account_type:
 *                       type: string
 *                       example: "Savings"
 *                       description: Type of the account
 *       401:
 *         description: Unauthorized request due to missing or invalid JWT token.
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
 *                   example: "Unauthorized: Invalid or missing token"
 *       404:
 *         description: No account found for the given user ID.
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
 *                   example: "Account not found"
 *       500:
 *         description: Internal server error.
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
 *                   example: "Server Error: Unable to retrieve account details"
 */

/**
 * @swagger
 * /api/users/reset-link:
 *   post:
 *     summary: Send a password reset email
 *     description: This API sends a password reset email to the user if the provided email exists in the system.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *                 description: The email address of the user requesting a password reset.
 *     responses:
 *       200:
 *         description: Password reset email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Password reset email sent.
 *                 resetLink:
 *                   type: string
 *                   example: "https://gaminghelperonline.com/playcode/Verify?token=a3VzaGFncmEuYWdyYXdhbEBsb2d6ZXJvdGVjaG5vbG9naWVzLmNvbQ==&vendorid=Mzky"
 *                 email:
 *                   type: string
 *                   example: "user@example.com"
 *                 user_id:
 *                   type: string
 *                   example: "123"
 *       400:
 *         description: Bad request or email not found in the system.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Email does not exist in the system.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: An error occurred while processing your request.
 */

/**
 * @swagger
 * /api/users/forgot-password:
 *   post:
 *     summary: Reset user's password
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *                 description: The email address associated with the user account
 *               user_id:
 *                 type: string
 *                 example: "123"
 *                 description: The unique ID of the user
 *               newPass:
 *                 type: string
 *                 example: "newPassword123"
 *                 description: The new password to be set
 *               conPass:
 *                 type: string
 *                 example: "newPassword123"
 *                 description: Confirmation of the new password
 *             required:
 *               - email
 *               - user_id
 *               - newPass
 *               - conPass
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password updated successfully"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Passwords do not match or invalid input"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found with the provided email and ID"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while resetting the password"
 */

/**
 * @swagger
 * /api/users/regenerate-access-token:
 *   post:
 *     summary: Regenerate access token
 *     description: Generate a new access token using a valid refresh token.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token used to generate a new access token
 *             required:
 *               - refreshToken
 *     responses:
 *       200:
 *         description: Access token regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Access token fetched successfully."
 *                 accessToken:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Bad request due to invalid or missing refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Refresh token is required"
 *       401:
 *         description: Unauthorized due to invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid refresh token"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while regenerating the access token"
 */

/**
 * @swagger
 * /api/users/logout:
 *   post:
 *     summary: Log out a user
 *     description: Clears the refresh token from the database and removes the cookie.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: User logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully."
 *       400:
 *         description: Bad request if refresh token is missing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Refresh token is required to log out."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An error occurred while logging out."
 */