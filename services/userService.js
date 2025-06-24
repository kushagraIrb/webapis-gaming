const otpService = require('./otpService');
const userModel = require('../models/userModel');

const db = require('../config/database');
const bcrypt = require('bcrypt');

const randomstring = require('randomstring');

const jwt = require('jsonwebtoken');
const { JWT_SECRET, BASE_URL } = process.env;

const requestIp = require('request-ip');
const sendMail = require('../helpers/sendMail');

class UserService {

    // Fetch user details based on jwt token
    static async fetchUserDetailsByJwtToken(userId) {
        try {
            const userDetails = await userModel.fetchUserDetailsByJwtToken(userId);
            if (!userDetails) {
                throw new Error('User not found');
            }
            return userDetails;
        } catch (error) {
            throw new Error('Error fetching user details');
        }
    }

    static async processSendOtp(email, phone) {
        const existingEmail = await userModel.findUserByEmail(email);
        const existingPhone = await userModel.findUserByPhone(phone);
    
        if (existingEmail && existingEmail.length > 0) {
            throw new Error('Email already exists.');
        }
        if (existingPhone && existingPhone.length > 0) {
            throw new Error('Phone number already exists.');
        }

        const otp = otpService.generateOtp();

        const mailSubject = 'Account Verification';
        const content = `
            <p>
                Dear User, You have requested to register on Gaming Helper Online as a Registered User. 
                The confidential OTP to verify your email id is ${otp}. 
                In case you have not requested the OTP, please ignore this email. 
                The OTP is valid for 15 seconds only.<br><br>
                Regards, Gaming Helper Online Administrator <br>
                <b>Note:</b> This is a system-generated message, please do not reply to it.<br><br>
                <b>Notice:</b> The information contained in this e-mail message and/or attachments may contain confidential or privileged information. 
                If you are not the intended recipient, any dissemination, use, review, distribution, or copying is strictly prohibited. 
                If received in error, please notify us immediately and delete this message permanently.<br><br>
                Thank you.
            </p>`;

        await otpService.sendOtpEmail(email, mailSubject, content);

        // Save OTP in the database
        const insertedId = await userModel.saveOtp(email, phone, otp);

        return { msg: 'OTP has been sent successfully!' };
    }

    static async checkNameExists(firstName, lastName) {
        return await userModel.checkUserNameExists(firstName, lastName);
    }

    static async generateNameSuggestions(firstName, lastName) {
        const timestamp = Date.now().toString().slice(-4);
        const randomNum = () => Math.floor(Math.random() * 90 + 10);

        // If lastName is provided, append variations to it
        if (lastName) {
            return [
                { first_name: firstName, last_name: `${lastName}${randomNum()}` },
                { first_name: firstName, last_name: `${lastName}_${randomNum()}` },
                { first_name: firstName, last_name: `${lastName}_${timestamp}` }
            ];
        } else {
            // If lastName is not provided, append variations to firstName and return as last_name
            return [
                { first_name: `${firstName}${randomNum()}` },
                { first_name: `${firstName}_${randomNum()}` },
                { first_name: `${firstName}_${timestamp}` }
            ];
        }
    }

    static async validateOtp(email, phone, otp) {
        const isValidOtp = await userModel.checkOtp(email, phone, otp);
        return isValidOtp;
    }

    static async registerUser(userData, ipAddress) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const userState = await this.getStateByPincode(userData.pincode) || userData.state;
    
        let referralDetails = await this.getReferralDetails(userData);
    
        // Generate referral code
        const referralCode = this.generateReferralCode();
    
        // Save user to database
        const newUser = await userModel.createUser(
            userData.first_name,
            userData.last_name || null,
            userData.email,
            hashedPassword,
            userData.phone,
            userData.pincode,
            userState,
            userData.is_eighteen,
            referralDetails.isRefer,
            referralDetails.userRefcode,
            referralDetails.adminRefcode,
            ipAddress
        );
    
        const LastUserID = newUser.insertId;
        const fullReferralCode = `${referralCode}${LastUserID}`;

        // Update the user registration table with the referral code
        const arrData = {
            referral_code: fullReferralCode,
            unique_id: LastUserID
        };

        await userModel.updateUser(LastUserID, arrData);
    
        if (referralDetails.isRefer) {
            await this.handleReferralBonuses(LastUserID, referralDetails);
        }

        // Generate the JWT access token (valid for 15 minutes)
        const accessToken = jwt.sign(
            { id: LastUserID },
            JWT_SECRET,
            { expiresIn: '24h' } // Short-lived token
        );

        // Generate the JWT refresh token (valid for 30 days)
        const refreshToken = jwt.sign(
            { id: LastUserID },
            JWT_SECRET, // Use a different secret for refresh tokens
            { expiresIn: '30d' } // Long-lived token
        );

        // Update session token in the database
        await userModel.updateSessionToken(LastUserID, accessToken, refreshToken);
    
        // return { msg: 'The user has been registered successfully!', userDetails: userDetails };
        return { msg: 'The user has been registered successfully!', accessToken, refreshToken };
    }

    // Fetch state name based on pincode
    static async getStateByPincode(pincode) {
        const stateName = await userModel.fetchState(pincode);
        return stateName || null;
    }
    
    // Helper to get referral details
    static async getReferralDetails(userData) {
        let isRefer = userData.is_referral ? 1 : 0;
        let referralAmount = 0, bonusStatus = '', UidR = '0', calculateTotBonus = 0;
        let adminRefcode = null, userRefcode = null, isType = 0;
    
        if (isRefer) {
            const adminRef = await userModel.findCouponByCode(userData.refer_to);
            if (adminRef) {
                referralAmount = adminRef.price;
                bonusStatus = 'Referral Bonus';
                adminRefcode = userData.refer_to;
                isType = adminRef.is_admin;
                calculateTotBonus = adminRef.price;
            } else {
                const refBonus = await userModel.getReferalamount();
                const referUid = await userModel.findUserByReferralCode(userData.refer_to);
    
                bonusStatus = 'Referral';
                UidR = referUid ? referUid.id : '0';
                userRefcode = userData.refer_to;
    
                if (referUid) {
                    const totalBonus = await CalculateBonusByUID(referUid.id);
                    calculateTotBonus = refBonus.bonus_amount + totalBonus;
                    referralAmount = refBonus.bonus_amount;
                }
            }
        }
    
        return { isRefer, referralAmount, bonusStatus, UidR, calculateTotBonus, adminRefcode, userRefcode, isType };
    }
    
    // Helper to generate referral code
    static generateReferralCode() {
        const Yr = new Date().getFullYear();
        const randomString = randomstring.generate({ length: 4, charset: 'numeric' });
        return `GH${Yr}${randomString}`;
    }
    
    // Helper to handle referral bonuses
    static async handleReferralBonuses(LastUserID, details) {
        const { referralAmount, UidR, calculateTotBonus, adminRefcode, bonusStatus, isType } = details;
    
        if (isType) {
            // Admin Referral
            const referralId = await this.insertReferralHistory(referralAmount, LastUserID, LastUserID, adminRefcode);
            await this.insertBonusHistory(referralId, LastUserID, referralAmount, calculateTotBonus, 'Credit', bonusStatus, adminRefcode);
        } else {
            // User Referral
            const referralId = await this.insertReferralHistory(referralAmount, LastUserID, UidR, adminRefcode);
            await this.insertBonusHistory(referralId, UidR, referralAmount, calculateTotBonus, 'Credit', bonusStatus, adminRefcode);
    
            // Self Referral
            const selfReferralId = await this.insertReferralHistory(referralAmount, LastUserID, LastUserID, adminRefcode);
            await this.insertBonusHistory(selfReferralId, LastUserID, referralAmount, referralAmount, 'Credit', bonusStatus, adminRefcode);
        }
    }

    static async loginUser(req, userData) {
        // Check if the user exists by phone
        const user = await this.validateUser(req, userData);
    
        if (!user) {
            throw new Error('Incorrect phone number or password!');
        }
    
        // Check if the user is verified and active
        if (user.is_verified !== 1 || user.status !== 1 || user.ip_status !== 1) {
            throw new Error('Your login Id is blocked, please contact the administrator.');
        }
    
        // Generate a new access token
        const newAccessToken = jwt.sign(
            { id: user.id },
            JWT_SECRET,
            { expiresIn: '24h' } // Short-lived token
        );
    
        // Optionally, regenerate the refresh token
        const newRefreshToken = jwt.sign(
            { id: user.id },
            JWT_SECRET,
            { expiresIn: '30d' } // Long-lived token
        );
    
        // Update session token in the database
        await userModel.updateSessionToken(user.id, newAccessToken, newRefreshToken);
    
        return { msg: 'Login successful!', newAccessToken, newRefreshToken };
    }

    // Validate user by phone
    static async validateUser(req, userData) {
        const loginQuery = userModel.getLoginQuery(userData.phone);

        const [user] = await db.promise().query(loginQuery);

        // If the user doesn't exist, return null
        if (!user || user.length === 0) {
            return null;
        }

        const storedPassword = user[0].password.replace("$2y$", "$2b$");
        // Check if the password is correct
        const validPassword = await bcrypt.compare(userData.password, storedPassword);
        if (!validPassword) {
            return null; // Password is incorrect
        }

        const clientIp6 = requestIp.getClientIp(req);
        const clientIp4 = clientIp6.replace(/^::ffff:/, '');

        const userAgent = req.headers['user-agent'];
    
        const logData = {
            phone: userData.phone,
            password: userData.password,
            result: user ? 1 : 0,
            query: JSON.stringify(loginQuery),
            ip_address: clientIp4,
            browser_info: JSON.stringify(userAgent),
            created_at: new Date()
        };
    
        await userModel.insertinLog(logData);
        await userModel.updateUserIpAddress(clientIp4, userData.phone);

        return user[0];
    }

    static async getBonusLeagueInfo(userId) {
        try {
            const leagueName = await userModel.fetchBonusLeagueInfo(userId);
            return leagueName || 'No League Assigned'; // Default value if league name is null
        } catch (error) {
            throw new Error('Error fetching bonus league info');
        }
    }    

    static async calculateTotalEarnings(userId) {
        try {
          // Step 1: Get the maximum transaction ID for the user
          const TotalEarnAmount = await userModel.TotalEarnAmount(userId);
          return TotalEarnAmount || 0;
        } catch (error) {
          throw new Error('Error calculating wallet amount');
        }
    }

    static async calculateReferralEarnings(userId) {
        try {
          // Step 1: Get the maximum transaction ID for the user
          const TotalReferralAmount = await userModel.TotalReferralAmount(userId);
          return TotalReferralAmount || 0;
        } catch (error) {
          throw new Error('Error calculating wallet amount');
        }
    }

    static async changeUserPassword(password, userId) {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
          
            const pwdUpdate = await userModel.changeUserPassword(hashedPassword, userId);

            if (pwdUpdate.affectedRows === 0) {
                throw new Error('Password update failed. User not found.');
            }
            
            return { status: 'Password updated successfully' };
        } catch (error) {
            throw new Error('Error updating password: ' + error.message);
        }
    }

    static async editProfile(userId, profileData) {
        try {
            const profileUpdate = await userModel.updateProfile(userId, profileData);
    
            if (profileUpdate.affectedRows === 0) {
                throw new Error('Profile update failed. User not found.');
            }
    
            return { status: 'Profile updated successfully' };
        } catch (error) {
            throw new Error('Error updating profile: ' + error.message);
        }
    }

    static async addAccount(userId, accountData) {
        try {
            const result = await userModel.addAccount(userId, accountData);
    
            if (!result || result.affectedRows === 0) {
                throw new Error('Account addition failed.');
            }
    
            return { status: 'Account information added successfully.' };
        } catch (error) {
            throw new Error('Error updating profile: ' + error.message);
        }
    }

    static async getAccountData(userId) {
        try {
            const result = await userModel.fetchAccountDetails(userId);
    
            if (!result || result.length === 0) {
                return null;
            }
    
            return result; // Return the account details
        } catch (error) {
            throw new Error('Error retrieving account details: ' + error.message);
        }
    }

    static async resetLink(email) {
        try {
            const user = await userModel.findUserByEmail(email);
    
            if (!user || user.length === 0) {
                // return { resetLink: null }; // Email not found
                throw new Error('User not found with the provided email and ID.');
            }
    
            const resetToken = Buffer.from(email).toString('base64');
            const userIdToken = Buffer.from(user[0].id.toString()).toString('base64');
    
            const resetLink = `${BASE_URL}/Verify?token=${resetToken}&vendorid=${userIdToken}`;
            const emailSent = await this.sendResetEmail(user[0].email, user[0].first_name, resetLink);
    
            if (emailSent) {
                return { resetLink };
            } else {
                throw new Error('Failed to send reset email.');
            }
        } catch (error) {
            throw new Error(error.message);
        }
    }

    static async sendResetEmail(email, name, resetLink) {
        try {
            const mailSubject = `Password Reset for Gaming Helper Online`;
            const content = `
                <div style="text-align: center; font-family: Arial, sans-serif;">
                    <h2>Gaming Helper Online</h2>
                    <p>Hello ${name},</p>
                    <p>We received a request to reset your password. You can reset it by clicking the link below:</p>
                    <a href="${resetLink}" style="background-color: #007bff; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
                    <p>If you didn't request this, please ignore this email.</p>
                    <p>Thanks, <br> The Gaming Helper Online Team</p>
                </div>
            `;
    
            await sendMail(email, mailSubject, content);
            return true;
        } catch (error) {
            console.error('Email Error:', error.message);
            return false;
        }
    }

    static async forgotUserPassword(newPassword, email) {
        try {
            if (!email) {
                return { success: false, msg: 'Email is required.' };
            }
    
            const user = await userModel.findUserByEmail(email);
    
            if (!user || user.length === 0) {
                return { success: false, msg: 'User not found with the provided email.' };
            }
    
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const result = await userModel.changeUserPassword(hashedPassword, user[0].id);
    
            if (!result || result.affectedRows === 0) {
                return { success: false, msg: 'Password update failed. Please try again.' };
            }
    
            return { success: true };
        } catch (error) {
            return { success: false, msg: 'Error updating password: ' + error.message };
        }
    }

    static async regenerateAccessToken(incomingRefreshToken) {
        try {
            // Verify the refresh token
            const decoded = jwt.verify(incomingRefreshToken, JWT_SECRET);
    
            // Fetch the user's current refresh token from the database
            const userTokens = await userModel.fetchTokens(decoded.id);
    
            if (!userTokens || userTokens.refresh_token !== incomingRefreshToken) {
                throw new Error('Invalid refresh token.');
            }
    
            // Generate a new access token (session_token)
            const newAccessToken = jwt.sign(
                { id: decoded.id },
                JWT_SECRET,
                { expiresIn: '24h' } // Short-lived token
            );
    
            // Update the new access token in the database
            await userModel.regenerateAccessToken(decoded.id, newAccessToken);
    
            // Return the new access token
            return { accessToken: newAccessToken };
        } catch (err) {
            throw new Error('Invalid refresh token.');
        }
    }

    static async logoutUser(refreshToken) {
        try {
            // Find and clear the refresh token from the database
            const user = await userModel.findUserByRefreshToken(refreshToken);
    
            if (!user) {
                throw new Error('Invalid refresh token.');
            }
    
            await userModel.clearRefreshToken(user.id);
        } catch (error) {
            throw new Error('Error while logging out.');
        }
    }
}

module.exports = UserService;