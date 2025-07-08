const { logger } = require('../logger');
const { validationResult } = require('express-validator');
const userService = require('../services/userService');
const liveBetService = require('../services/liveBetService');
const requestIp = require('request-ip');

class UserController {
    // Fetch user details based on jwt token
    async fetchUserDetailsByJwtToken(req, res) {
        try {
            const user_id = req.user_id;
            if (!user_id) {
                return res.status(400).json({ msg: 'User ID not found in token' });
            }
    
            const userDetails = await userService.fetchUserDetailsByJwtToken(user_id);
    
            if (!userDetails) {
                return res.status(404).json({ msg: 'User not found' });
            }
    
            return res.status(200).json(userDetails);
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ msg: error.message });
        }
    }    

    // Send OTP Method
    async sendOtp(req, res) {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, phone } = req.body;

            const response = await userService.processSendOtp(email, phone);
            return res.status(200).send(response);
        } catch (error) {
            console.error('Error sending OTP:', error.message);
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: 'An error occurred', error: error.message });
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
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
            const { user_id, first_name, last_name } = req.body;

            if (!user_id || !first_name) {
                return res.status(400).json({ msg: 'user_id and first_name are required.' });
            }

            const updated = await userService.updateUserName(user_id, first_name, last_name || '');

            if (updated) {
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

            const { msg, accessToken, refreshToken } = await userService.registerUser(userData, clientIp4);

            // Set refresh token in an HTTP-only cookie
            res.cookie('refreshToken', refreshToken, {
                // httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
    
            // Send response back to the client
            return res.status(200).send({ msg, accessToken });
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }

    // Login Method
    async login(req, res) {
        try {
            const errors = validationResult(req);
    
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
    
            // Call the login service
            const { msg, newAccessToken, newRefreshToken } = await userService.loginUser(req, req.body);
    
            // Set refresh token in an HTTP-only cookie
            res.cookie('refreshToken', newRefreshToken, {
                // httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
    
            // Send response back to the client
            return res.status(200).send({ msg, newAccessToken });
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }    

    async changePassword(req, res) {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { password } = req.body;
            const user_id  = req.user_id;

            const response = await userService.changeUserPassword(password, user_id);

            return res.status(200).send({ msg: 'Password updated successfully', response });
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }

    async userDashboard(req, res) {
        try {
            const user_id  = req.user_id;

            const walletAmount = parseFloat(await liveBetService.calculateWalletAmount(user_id));
            const bonusAmount = parseFloat(await liveBetService.calculateBonus(user_id));
            const bonusLeagueInfo = await userService.getBonusLeagueInfo(user_id);
            const totalEarnings = parseFloat(await userService.calculateTotalEarnings(user_id));

            const referralEarnings = parseFloat(await userService.calculateReferralEarnings(user_id));

            return res.status(200).send({
                walletAmount,
                bonusAmount,
                bonusLeagueInfo,
                totalEarnings,
                referralEarnings
            });
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
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
    
            return res.status(200).send({message: 'Profile updated successfully'});
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ message: error.message });
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
    
            const response = await userService.addAccount(userId, accountData);
    
            return res.status(200).send(response);
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ message: error.message });
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email, newPass, conPass } = req.body;

            if (!email || !newPass || !conPass) {
                return res.status(400).json({ msg: 'Email and passwords are required.' });
            }
      
            if (newPass !== conPass) {
              return res.status(400).json({ msg: 'Passwords do not match.' });
            }
      
            const updateResult = await userService.forgotUserPassword(newPass, email);

            if (updateResult.success) {
                return res.status(200).json({ msg: 'Password updated successfully.' });
            } else {
                return res.status(400).json({ msg: updateResult.msg });
            }
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
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
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).send({ msg: error.message });
        }
    }

    async logout(req, res) {
        try {
            const refreshToken = req.body.refreshToken || req.cookies.refreshToken;
    
            // Check if a refresh token is provided
            if (!refreshToken) {
                return res.status(400).json({ message: 'Refresh token is required to log out.' });
            }
    
            // Remove the refresh token from the database
            await userService.logoutUser(refreshToken);
    
            // Clear the refresh token from cookies
            res.clearCookie('refreshToken', {
                // httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
            });
    
            return res.status(200).json({ message: 'Logged out successfully.' });
        } catch (error) {
            logger.error(`Error fetching about us data: ${error.message}`, { stack: error.stack });
            
            return res.status(500).json({ message: 'An error occurred while logging out.' });
        }
    }
}

module.exports = new UserController();