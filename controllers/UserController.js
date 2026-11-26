const { logger } = require('../logger');
const { validationResult } = require('express-validator');
const userService = require('../services/userService');
const liveBetService = require('../services/liveBetService');
const requestIp = require('request-ip');
const userModel = require('../models/userModel');
const DeviceTrust = require('../services/deviceTrustService');
const AccountOtp = require('../services/accountOtpService');
const EmailSetup = require('../services/emailSetupService');
const authLog = require('../models/authLogModel');
const TotpService = require('../services/totpService');
const LoginBlock = require('../services/loginBlockService');
const passwordRules = require('../helpers/passwordRules');
const bcrypt = require('bcrypt');

// Registration must not fail after the account exists, so a problem here is only logged.
async function trustRegisteringDevice(userId, req) {
    try {
        return userId ? await DeviceTrust.trustNewDevice(userId, req) : null;
    } catch (error) {
        logger.error(`Could not trust the registering device for user ${userId}: ${error.message}`);
        return null;
    }
}

class UserController {
    // Fetch user details based on jwt token
    async fetchUserDetailsByJwtToken(req, res) {
        try {
            const user_id = req.user_id;
    
            if (!user_id) {
                return res.status(400).json({ msg: 'User ID not found in token' });
            }
    
            const userDetails = await userService.fetchUserDetailsByJwtToken(user_id);
            return res.status(200).json(userDetails);
    
        } catch (error) {
            const statusCode = error.statusCode || 500;
    
            if (statusCode === 500) {
                logger.error(`Error fetching user details by JWT token: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).json({
                msg: error.message || 'Something went wrong'
            });
        }
    }

    // Send OTP Method
    async sendOtp(req, res) {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, phone, name } = req.body;

            const response = await userService.processSendOtp(email, phone, name);
            return res.status(200).send(response);
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error sending OTP: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                msg: error.message || 'An error occurred'
            });
        }
    }

    // Fetch State based on pincode
    async fetchUserState(req, res) {
        try {
            const { pincode } = req.query;

            if (!pincode) {
                return res.status(400).send({ msg: 'Pincode is required' });
            }

            const state = await userService.getStateByPincode(pincode);
            return res.status(200).send({ state_name: state });
        } catch (error) {
            console.error('Error fetching state:', error.message);
            logger.error(`Error fetching user state: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
        }
    }

    // Auto suggest name
    async checkNameAvailability(req, res) {
        try {
            const { first_name, last_name, user_id } = req.body;

            if (!first_name) {
                return res.status(400).json({ msg: 'First name is required.' });
            }

            const nameExists = await userService.checkNameExists(first_name, last_name || '', user_id);

            if (nameExists) {
                const suggestions = await userService.generateNameSuggestions(first_name, last_name || '');
                return res.status(200).json({
                    msg: 'A user with this name already exists.',
                    alreadyExists: true,
                    suggestions
                });
            }

            return res.status(200).json({
                msg: 'Name is available.',
                alreadyExists: false
            });
        } catch (error) {
            logger.error(`Error checking name availability: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ msg: 'Something went wrong.' });
        }
    }

    async updateUserName(req, res) {
        try {
            // The user is always the logged-in one: a user_id in the body is ignored.
            const user_id = req.user_id;
            const { first_name, last_name } = req.body;

            if (!user_id || !first_name) {
                return res.status(400).json({ msg: 'first_name is required.' });
            }

            const updated = await userService.updateUserName(user_id, first_name, last_name || '');

            if (updated) {
                authLog.record(req, { userId: user_id, eventType: 'profile_update', method: 'session', details: 'name' });
                return res.status(200).json({
                    msg: 'Name updated successfully.',
                    status: true
                });
            } else {
                return res.status(404).json({
                    msg: 'User not found or name not updated.',
                    status: false
                });
            }
        } catch (error) {
            logger.error(`Error updating user name: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ msg: 'Something went wrong.' });
        }
    }

    // Register Method
    async register(req, res) {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            const isValidOtp = await userService.validateOtp(req.body.email, req.body.phone, req.body.otp);
            if (!isValidOtp) {
                return res.status(400).json({ msg: 'Invalid OTP. Please try again.' });
            }

            const clientIp6 = requestIp.getClientIp(req);
            const clientIp4 = clientIp6.replace(/^::ffff:/, '');

            // Prepare user data dynamically
            const userData = {
                first_name: req.body.first_name,
                email: req.body.email,
                password: req.body.password,
                phone: req.body.phone,
                pincode: req.body.pincode,
                is_eighteen: req.body.is_eighteen
            };
            if (req.body.last_name) 
                userData.last_name = req.body.last_name; // Include only if present

            const { msg, accessToken, refreshToken, userId } = await userService.registerUser(userData, clientIp4);

            // Set refresh token in an HTTP-only cookie
            res.cookie('refreshToken', refreshToken, {
                // httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });

            // The browser that just registered is trusted, so the first login on it does not ask for an OTP.
            authLog.record(req, { userId, eventType: 'signup', method: 'password' });
            const deviceId = await trustRegisteringDevice(userId, req);

            // Send response back to the client
            return res.status(200).send({ msg, accessToken, ...(deviceId && { deviceId }) });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error in registering new user: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                msg: error.message || 'Something went wrong'
            });
        }
    }

    async googleRegister(req, res) {
        try {
            const clientIp = requestIp.getClientIp(req)?.replace(/^::ffff:/, '');
            const { accessToken, refreshToken, msg, userId } = await userService.googleRegister(req.body, clientIp);

            res.cookie('refreshToken', refreshToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
            });

            authLog.record(req, { userId, eventType: 'signup', method: 'google' });
            const deviceId = await trustRegisteringDevice(userId, req);

            return res.status(200).send({ msg, accessToken, ...(deviceId && { deviceId }) });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            if (statusCode === 500) {
                logger.error(`Google authentication error: ${error.message}`, { stack: error.stack });
            }
            return res.status(statusCode).send({ msg: error.message || 'Google registration failed.' });
        }
    }

    async googleLogin(req, res) {
        try {
            const googleResult = await userService.googleLogin(req.body, req);

            // New browser or device: the Google account was right, but the session waits for the email OTP.
            if (googleResult.otpRequired) {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: googleResult.challengeId,
                    email: googleResult.maskedEmail,
                    method: googleResult.method || 'email',
                    msg: googleResult.method === 'totp'
                        ? 'Enter the code from your Authenticator app.'
                        : `We sent a verification code to ${googleResult.maskedEmail}.`
                });
            }

            const { accessToken, refreshToken, msg } = googleResult;
            authLog.record(req, { userId: googleResult.userId, eventType: 'login', method: 'google' });

            res.cookie('refreshToken', refreshToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
            });

            return res.status(200).send({ msg, accessToken });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            if (statusCode !== 500) {
                authLog.recordFailure(req, { method: 'google', reason: error.message });
            }
            if (statusCode === 500) {
                logger.error(`Google login error: ${error.message}`, { stack: error.stack });
            }
            return res.status(statusCode).send({ msg: error.message || 'Google login failed.' });
        }
    }

    // Login Method
    async login(req, res) {
        let apiResponseMsg = '';
        let result = 0;

        // Only plain text/number credentials are accepted: an object or array value (for
        // example {"$ne":"x"}) must never reach the SQL layer or the login log.
        const isPlain = (v) => v === undefined || v === null || typeof v === 'string' || typeof v === 'number';
        if (!isPlain(req.body.phone) || !isPlain(req.body.password)) {
            return res.status(400).json({ msg: 'Invalid phone or password format.' });
        }
        if (req.body.phone != null) req.body.phone = String(req.body.phone);
        if (req.body.password != null) req.body.password = String(req.body.password);

        const phone = req.body.phone || null;
        const password = req.body.password || null;

        // Blocked IP or blocked phone (too many failed logins): refused before the password is even looked at.
        const blocked = await LoginBlock.check(req, phone);
        if (blocked) {
            authLog.recordFailure(req, { method: 'password', reason: 'blocked', phone });
            return res.status(429).json(LoginBlock.body(blocked));
        }

        // Prepare login query once (if phone exists)
        const loginQuery = phone ? userModel.getLoginQuery(phone) : null;
    
        // Common log payload
        const baseLog = {
            phone,
            password,
            query: loginQuery ? JSON.stringify(loginQuery) : null,
            ip_address: requestIp.getClientIp(req)?.replace(/^::ffff:/, ''),
            browser_info: req.headers['user-agent']
        };
    
        try {
            const errors = validationResult(req);
    
            // ❌ Validation error
            if (!errors.isEmpty()) {
                apiResponseMsg = JSON.stringify(errors.array());
    
                await userModel.insertinLog({
                    ...baseLog,
                    result: 0,
                    api_response: apiResponseMsg
                });
    
                return res.status(400).json({ errors: errors.array() });
            }
    
            // ✅ Service login
            const loginResult = await userService.loginUser(req, req.body);

            // New browser or device: the password was right, but the session waits for the email OTP.
            if (loginResult.otpRequired) {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: loginResult.challengeId,
                    email: loginResult.maskedEmail,
                    method: loginResult.method || 'email',
                    msg: loginResult.method === 'emailsetup'
                        ? 'Please add your email address to continue.'
                        : loginResult.method === 'totp'
                        ? 'Enter the code from your Authenticator app.'
                        : `We sent a verification code to ${loginResult.maskedEmail}.`
                });
            }

            const { msg, newAccessToken, newRefreshToken } = loginResult;
            authLog.record(req, { userId: loginResult.userId, eventType: 'login', method: 'password' });

            apiResponseMsg = msg;
            result = 1;
    
            res.cookie('refreshToken', newRefreshToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
            });
    
            // ✅ Success log
            await userModel.insertinLog({
                ...baseLog,
                result,
                api_response: apiResponseMsg
            });
    
            return res.status(200).send({ msg, newAccessToken });
    
        } catch (error) {
            const statusCode = error.statusCode || 500;
            apiResponseMsg = error.message || 'Login failed';

            // A refused login (wrong password, unknown phone, blocked account) goes in the activity log.
            // A wrong password or unknown phone also counts towards the login block: that row is written
            // before the answer is sent, and if it was the last attempt allowed the IP and phones are blocked.
            let newBlock = null;
            let attemptsLeft = null;
            if (statusCode !== 500) {
                const reason = req.authFailReason || apiResponseMsg;
                if (LoginBlock.COUNTED_REASONS.includes(reason)) {
                    await authLog.recordFailureNow(req, { method: 'password', reason, phone });
                    ({ block: newBlock, attemptsLeft } = await LoginBlock.afterFailedAttempt(req));
                } else {
                    authLog.recordFailure(req, { method: 'password', reason, phone });
                }
            }

            // A failure to write the login log must never stop the response being sent.
            try {
                await userModel.insertinLog({
                    ...baseLog,
                    result: 0,
                    api_response: apiResponseMsg
                });
            } catch (logError) {
                logger.error(`Login log write failed: ${logError.message}`);
            }

            if (statusCode === 500) {
                logger.error(`Login error: ${error.message}`, { stack: error.stack });
            }

            // That was the last attempt: the answer is the block, not "wrong password".
            if (newBlock) {
                return res.status(429).send(LoginBlock.body(newBlock));
            }

            // A wrong password that did not block yet: say how many tries are left.
            if (attemptsLeft !== null && statusCode === 401) {
                return res.status(401).send({ msg: LoginBlock.attemptsMessage(apiResponseMsg, attemptsLeft), attemptsLeft });
            }

            return res.status(statusCode).send({ msg: apiResponseMsg });
        }
    }

    // Second step of a new-device login: the emailed code turns the pending login into a session.
    async verifyLoginOtp(req, res) {
        try {
            const { challengeId, otp } = req.body || {};
            const { msg, accessToken, refreshToken, deviceId, userId, method } = await userService.completeDeviceLogin(challengeId, otp, req);
            authLog.record(req, { userId, eventType: 'login', method: method === 'google' ? 'google' : 'otp' });

            res.cookie('refreshToken', refreshToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
            });

            // newAccessToken is what the password login screen reads; accessToken is what Google login reads.
            return res.status(200).send({ msg, accessToken, newAccessToken: accessToken, deviceId });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode !== 500 && error.userId) {
                authLog.recordFailure(req, { method: 'otp', reason: error.message, userId: error.userId });
            }

            if (statusCode === 500) {
                logger.error(`Error verifying login OTP: ${error.message}`, { stack: error.stack });
            }

            return res.status(statusCode).send({
                msg: statusCode === 500 ? 'Something went wrong' : error.message,
                ...(error.restartLogin && { restartLogin: true })
            });
        }
    }

    // ---- email for users who have none --------------------------------------------------------

    emailSetupError(res, error, label) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            logger.error(`Error in ${label}: ${error.message}`, { stack: error.stack });
        }
        return res.status(statusCode).send({
            msg: statusCode === 500 ? 'Something went wrong' : error.message,
            ...(error.restartLogin && { restartLogin: true }),
            ...(error.restartEmailSetup && { restartEmailSetup: true }),
            ...(error.emailRequired && { emailRequired: true })
        });
    }

    // Login: the pending login (challengeId) proves who is asking.
    async loginEmailSetupSend(req, res) {
        try {
            const { challengeId, email } = req.body || {};
            const { maskedEmail } = await userService.beginLoginEmailSetup(challengeId, email, req);
            return res.status(200).send({ msg: `We sent a verification code to ${maskedEmail}.`, email: maskedEmail });
        } catch (error) {
            return this.emailSetupError(res, error, 'loginEmailSetupSend');
        }
    }

    async loginEmailSetupResend(req, res) {
        try {
            const { maskedEmail } = await userService.resendLoginEmailSetup((req.body || {}).challengeId, req);
            return res.status(200).send({ msg: `We sent a new verification code to ${maskedEmail}.`, email: maskedEmail });
        } catch (error) {
            return this.emailSetupError(res, error, 'loginEmailSetupResend');
        }
    }

    async loginEmailSetupConfirm(req, res) {
        try {
            const { challengeId, otp } = req.body || {};
            const result = await userService.completeLoginEmailSetup(challengeId, otp, req);

            // Authenticator is still needed: carry on with that step.
            if (result.otpRequired) {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: result.challengeId,
                    email: result.maskedEmail,
                    method: result.method,
                    msg: result.method === 'totp' ? 'Enter the code from your Authenticator app.' : 'Set up Google Authenticator to continue.'
                });
            }

            const { msg, accessToken, refreshToken, deviceId, userId, method } = result;
            authLog.record(req, { userId, eventType: 'login', method: method === 'google' ? 'google' : 'otp' });
            res.cookie('refreshToken', refreshToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
            });
            return res.status(200).send({ msg, accessToken, newAccessToken: accessToken, deviceId });
        } catch (error) {
            if ((error.statusCode || 500) !== 500 && error.userId) {
                authLog.recordFailure(req, { method: 'otp', reason: error.message, userId: error.userId });
            }
            return this.emailSetupError(res, error, 'loginEmailSetupConfirm');
        }
    }

    // Logged in (bank account or withdrawal screens): same steps, the session proves who is asking.
    async emailSetupSend(req, res) {
        try {
            const verifyId = require('crypto').randomBytes(32).toString('hex');
            const { maskedEmail } = await EmailSetup.start(req.user_id, `user:${verifyId}`, (req.body || {}).email, req);
            return res.status(200).send({ verifyId, msg: `We sent a verification code to ${maskedEmail}.`, email: maskedEmail });
        } catch (error) {
            return this.emailSetupError(res, error, 'emailSetupSend');
        }
    }

    async emailSetupResend(req, res) {
        try {
            const verifyId = this.verifyIdFrom(req);
            const { maskedEmail } = await EmailSetup.resend(req.user_id, `user:${verifyId}`, req);
            return res.status(200).send({ msg: `We sent a new verification code to ${maskedEmail}.`, email: maskedEmail });
        } catch (error) {
            return this.emailSetupError(res, error, 'emailSetupResend');
        }
    }

    async emailSetupConfirm(req, res) {
        try {
            const verifyId = this.verifyIdFrom(req);
            const email = await EmailSetup.confirm(req.user_id, `user:${verifyId}`, (req.body || {}).otp, req);
            return res.status(200).send({ status: true, email, msg: 'Your email has been verified and saved.' });
        } catch (error) {
            return this.emailSetupError(res, error, 'emailSetupConfirm');
        }
    }

    verifyIdFrom(req) {
        const verifyId = String((req.body || {}).verifyId || '');
        if (!/^[a-f0-9]{64}$/.test(verifyId)) {
            throw Object.assign(new Error('This verification has expired. Please start again.'), { statusCode: 400, restartEmailSetup: true });
        }
        return verifyId;
    }

    async resendLoginOtp(req, res) {
        try {
            const { challengeId } = req.body || {};
            const { maskedEmail } = await userService.resendLoginOtp(challengeId);

            return res.status(200).send({ msg: `We sent a new verification code to ${maskedEmail}.`, email: maskedEmail });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error resending login OTP: ${error.message}`, { stack: error.stack });
            }

            return res.status(statusCode).send({
                msg: statusCode === 500 ? 'Something went wrong' : error.message,
                ...(error.restartLogin && { restartLogin: true })
            });
        }
    }

    async changePassword(req, res) {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { password, current_password } = req.body;
            const user_id  = req.user_id;

            const response = await userService.changeUserPassword(password, user_id, req, current_password);

            return res.status(200).send({ msg: 'Password updated successfully', response });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error changing pwd: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                msg: error.message || 'Something went wrong',
                ...(error.blockedUntil && { blockedUntil: error.blockedUntil })
            });
        }
    }
    
    async editProfile(req, res) {
        try {
            const errors = validationResult(req);
    
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
    
            const { first_name, last_name } = req.body;
            const profile_image = req.file ? req.file.filename : ''; // Use uploaded image
            const userId = req.user_id;
    
            if (!first_name) {
                return res.status(400).send({ msg: 'First name is required' });
            }
    
            // Prepare profile data dynamically
            const profileData = { first_name, profile_image };
            if (last_name) 
                profileData.last_name = last_name; // Only include if present

            const response = await userService.editProfile(userId, profileData);

            authLog.record(req, {
                userId,
                eventType: 'profile_update',
                method: 'session',
                details: ['name', req.file ? 'image' : null].filter(Boolean).join(', '),
            });
    
            return res.status(200).send({message: 'Profile updated successfully'});
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error editing profile: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                message: error.message || 'Something went wrong'
            });
        }
    }

    async addAccount(req, res) {
        try {
            const errors = validationResult(req);
    
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
    
            const userId = req.user_id;
    
            const accountData = {
                holder_name: req.body.holder_name,
                account: req.body.account,
                ifsc_code: req.body.ifsc_code,
                bank_name: req.body.bank_name,
                account_type: req.body.account_type,
                addhar_number: req.body.addhar_number,
                upi_id: req.body.upi_id,
                phone_pay: req.body.phone_pay,
                g_pay: req.body.g_pay,
                paytm: req.body.paytm,
            };
    
            // With ACCOUNT_OTP_ENABLED the account is saved only on the second call, which carries
            // the emailed code. The first call just sends the code.
            const hint = await AccountOtp.hintFor(AccountOtp.PURPOSES.ADD, userId, accountData);
            const gate = await AccountOtp.gateAction(req, userId, AccountOtp.PURPOSES.ADD, accountData, {
                hint,
                precheck: async () => {
                    if (await userModel.isAddAccountBlocked(userId)) {
                        const err = new Error('You already have an account added. Adding a new account is temporarily not allowed.');
                        err.statusCode = 400;
                        throw err;
                    }
                },
            });

            if (!gate.proceed) {
                return res.status(202).json({
                    otpRequired: true,
                    challengeId: gate.challengeId,
                    email: gate.maskedEmail,
                    message: `We sent a verification code to ${gate.maskedEmail}.`
                });
            }

            const response = await userService.addAccount(userId, accountData);
            AccountOtp.completed(req, userId, AccountOtp.PURPOSES.ADD, { acId: response.acId, hint });

            return res.status(200).send({ status: response.status });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error in addAccount: ${error.message}`, { stack: error.stack });
            }

            // A server error never shows its raw text (it is already in the log above).
            return res.status(statusCode).send({
                message: statusCode === 500 ? 'Something went wrong. Please try again.' : (error.message || 'Something went wrong'),
                ...(error.restartOtp && { restartOtp: true }),
                ...(error.emailRequired && { emailRequired: true })
            });
        }
    }

    async getAccount(req, res) {
        try {
            const userId = req.user_id; // Assume userId is obtained from the JWT or authentication middleware
    
            if (!userId) {
                return res.status(400).json({ status: false, message: "User ID is required" });
            }
    
            const response = await userService.getAccountData(userId);
        
            if (!response) {
                return res.status(404).json({ status: false, message: "Account not found" });
            }
    
            return res.status(200).json({
                status: true,
                message: "Account details retrieved successfully",
                data: response,
            });
        } catch (error) {
            console.error(error);
            logger.error(`Error in getAccount: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ status: false, message: "Server Error: " + error.message });
        }
    }

    async resetLink(req, res) {
        try {
            const { email } = req.body;
            const { resetLink, userId } = await userService.resetLink(email);

            if (resetLink) {
                // Email sent successfully
                res.status(200).json({ msg: `Password reset email sent.` });
            } else {
                res.status(400).json({ msg: 'Email does not exist in the system.' });
            }
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error in resetLink: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                msg: error.message || 'Something went wrong'
            });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { token, newPass, conPass } = req.body;

            if (!token || !newPass || !conPass) {
                return res.status(400).json({ msg: 'Reset token and passwords are required.' });
            }

            if (newPass !== conPass) {
              return res.status(400).json({ msg: 'Passwords do not match.' });
            }

            // The new password follows the same four rules as registration and Change Password. A weak one is
            // refused before the link is used, so the same link still works for the next try.
            if (!passwordRules.isValid(newPass)) {
                return res.status(400).json({ msg: passwordRules.MESSAGE });
            }

            const updateResult = await userService.forgotUserPassword(newPass, token);

            if (updateResult.success) {
                return res.status(200).json({ msg: 'Password updated successfully.' });
            } else {
                return res.status(400).json({ msg: updateResult.msg });
            }
        } catch (error) {
            logger.error(`Error in forgotPassword: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ msg: 'Internal server error.', error: error.message });
        }
    }

    async regenerateAccessToken(req, res) {
        try {
            const incomingRefreshToken = req.body.refreshToken || req.cookies.refreshToken;

            if(!incomingRefreshToken) {
                return res.status(400).json({ msg: 'Refresh token is required' });
            }

            const response = await userService.regenerateAccessToken(incomingRefreshToken);

            return res.status(200).send({ msg: 'Access Token fetched successfully.', response });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error in regenerateAccessToken: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).send({
                msg: error.message || 'Something went wrong'
            });
        }
    }

    // ---- Google Authenticator (TOTP) --------------------------------------------------------

    totpError(res, error, label) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 500) {
            logger.error(`Error in ${label}: ${error.message}`, { stack: error.stack });
        }
        return res.status(statusCode).json({
            message: statusCode === 500 ? 'Something went wrong. Please try again.' : error.message
        });
    }

    async totpStatus(req, res) {
        try {
            return res.status(200).json({ status: true, ...(await TotpService.status(req.user_id)) });
        } catch (error) {
            return this.totpError(res, error, 'totpStatus');
        }
    }

    async totpSetup(req, res) {
        try {
            const [user] = await userModel.findUserById(req.user_id);
            const label = (user && (user.email || user.phone)) || req.user_id;
            const { secret, qr } = await TotpService.beginSetup(req.user_id, label);
            return res.status(200).json({ status: true, secret, qr });
        } catch (error) {
            return this.totpError(res, error, 'totpSetup');
        }
    }

    async totpEnable(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
            }
            const { backupCodes } = await TotpService.confirmEnable(req.user_id, req.body.code);
            authLog.record(req, { userId: req.user_id, eventType: 'profile_update', method: 'password', details: 'Authenticator turned on' });
            const [owner] = await userModel.findUserById(req.user_id);
            DeviceTrust.sendAuthenticatorAlert(owner, req, 'on');
            return res.status(200).json({ status: true, message: 'Authenticator is now on.', backupCodes });
        } catch (error) {
            return this.totpError(res, error, 'totpEnable');
        }
    }

    async totpDisable(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
            }
            const { password, code } = req.body;

            const [user] = await userModel.findUserById(req.user_id);
            const passwordOk = user && await bcrypt.compare(password, String(user.password).replace('$2y$', '$2b$'));
            if (!passwordOk) {
                return res.status(400).json({ message: 'Password is not correct.' });
            }
            if (!(await TotpService.verifyAny(req.user_id, code))) {
                return res.status(400).json({ message: 'That code is not correct.' });
            }

            await TotpService.disable(req.user_id);
            // Turning off a protection: no browser stays trusted except this one.
            await DeviceTrust.clearOthersForUser(req.user_id, req);
            authLog.record(req, { userId: req.user_id, eventType: 'profile_update', method: 'password', details: 'Authenticator turned off' });
            DeviceTrust.sendAuthenticatorAlert(user, req, 'off');
            return res.status(200).json({ status: true, message: 'Authenticator is now off.' });
        } catch (error) {
            return this.totpError(res, error, 'totpDisable');
        }
    }

    async logout(req, res) {
        try {
            // The logged-in user (from the verified access token) is the one logged out.
            if (!req.user_id) {
                return res.status(401).json({ message: 'Unauthorized. Please log in.' });
            }

            await userService.logoutUser(req.user_id);
    
            // Clear the refresh token from cookies
            res.clearCookie('refreshToken', {
                // httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
            });
    
            return res.status(200).json({ message: 'Logged out successfully.' });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 500) {
                logger.error(`Error in logout: ${error.message}`, { stack: error.stack });
            }
    
            return res.status(statusCode).json({
                message: error.message || 'Something went wrong'
            });
        }
    }
}

module.exports = new UserController();
