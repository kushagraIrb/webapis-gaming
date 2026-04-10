const db = require('../config/database');
const moment = require('moment');

class UserModel {
    // Fetch user details based on jwt token
    static async fetchUserDetailsByJwtToken(userId) {
        try {
            const query = `
                SELECT 
                    r.id, r.first_name, r.last_name, r.email, r.phone, 
                    r.pincode, r.state, r.profile_image, r.traffic_source, r.attr, r.status, r.ip_status,
                    b.league_name 
                FROM tbl_registration AS r
                LEFT JOIN tbl_bonus_league AS b ON r.bonus_league_id = b.id
                WHERE r.id = ?
            `;
            const [result] = await db.promise().query(query, [userId]);
            return result[0] || null;
        } catch (error) {
            throw new Error('Database query error');
        }
    }

    static async getBonusIdByUserId(userId) {
        try {
            const query = `SELECT bonus_league_id FROM tbl_registration WHERE id = ?`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching user:', error);
            throw new Error('Error fetching user.');
        }
    }

    // Fetch user's current tokens
    static async fetchTokens(userId) {
        try {
            const query = `SELECT session_token, refresh_token FROM tbl_registration WHERE id = ?`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0] || null;
        } catch (error) {
            throw new Error('Database query error');
        }
    }

    // Update session token (access token) in the database
    static async regenerateAccessToken(userId, newAccessToken) {
        try {
            const query = `UPDATE tbl_registration SET session_token = ? WHERE id = ?`;
            await db.promise().execute(query, [newAccessToken, userId]);
        } catch (error) {
            throw new Error('Database update error');
        }
    }

    static async findUserByEmail(email) {
        const [result] = await db.promise().query(
            `SELECT * FROM tbl_registration WHERE LOWER(email) = LOWER(?)`,
            [email]
        );
        return result;
    }

    static async findUserByPhone(phone) {
        const [result] = await db.promise().query(
            `SELECT * FROM tbl_registration WHERE phone = ?`,
            [phone]
        );
        return result;
    }

    static async getUserByIdAndEmail(userId, email) {
        try {
            const query = `SELECT * FROM tbl_registration WHERE id = ? AND email = ?`;
            const [rows] = await db.promise().query(query, [userId, email]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching user:', error);
            throw new Error('Error fetching user.');
        }
    }

    static async saveOtp(email, phone, otp) {
        const query = `INSERT INTO otp_verified (email, phone, otp, otp_type) VALUES(?, ?, ?, ?)`;
        const [result] = await db.promise().query(query, [email, phone, otp, 1]);
        return result.insertId;
    }

    static async fetchState(pincode) {
        const [result] = await db.promise().query(
            `SELECT state_name FROM tbl_states_pincode WHERE pincode = ? LIMIT 1`,
            [pincode]
        );
        return result.length > 0 ? result[0].state_name : null;
    }

    static async findCouponByCode(refer_to) {
        const [result] = await db.promise().query(
            `SELECT code,price,is_admin FROM tbl_coupon_code WHERE is_delete = ? AND status=? AND code = ?`,
            [1, 1, refer_to]
        );
        return result;
    }

    static async getReferalamount() {
        const [result] = await db.promise().query(
            'SELECT bonus_amount FROM tbl_referral_bonus WHERE status = 1'
        );
        return result;
    }

    static async findUserByReferralCode(refer_to) {
        const [result] = await db.promise().query(
            `SELECT id FROM tbl_registration WHERE referral_code = ?`,
            [refer_to]
        );
        return result;
    }

    static async CalculateBonusByUID(userId) {
        // Step 1: Get the maximum `bonus_id` for the given `user_id`
        const [result] = await db.promise().query(
            `SELECT MAX(bonus_id) AS bonus_id FROM tbl_bonus_history WHERE user_id = ?`,
            [userId]
        );

        // Step 2: If a bonus_id is found, fetch the `total_bonus` for that `bonus_id`
        if (result && result.bonus_id) {
            const [bonusResult] = await db.promise().query(
                `SELECT total_bonus FROM tbl_bonus_history WHERE bonus_id = ?`,
                [result.bonus_id]
            );

            // Step 3: Return the total bonus or 0 if no bonus is found
            if (bonusResult && bonusResult.length > 0) {
                return bonusResult[0].total_bonus;
            } else {
                return 0;
            }
        }

        // If no bonus_id found, return 0
        return 0;
    }

    static async checkUserNameExists(firstName, lastName, userId = null) {
        let query, params;

        if (lastName) {
            query = `
                SELECT COUNT(*) AS count 
                FROM tbl_registration 
                WHERE first_name = ? AND last_name = ?
            `;
            params = [firstName, lastName];
        } else {
            query = `
                SELECT COUNT(*) AS count 
                FROM tbl_registration 
                WHERE first_name = ? AND (last_name IS NULL OR last_name = '')
            `;
            params = [firstName];
        }

        // If it's an existing user, exclude their own record
        if (userId) {
            query += ` AND id != ?`;
            params.push(userId);
        }

        const [rows] = await db.promise().query(query, params);
        return rows[0].count > 0;
    }

    static async updateUserName(userId, firstName, lastName) {
        const query = `
            UPDATE tbl_registration 
            SET first_name = ?, last_name = ?
            WHERE id = ?
        `;
        const [result] = await db.promise().query(query, [firstName, lastName, userId]);
        return result.affectedRows > 0;
    }

    static async checkOtp(email, phone, otp) {
        const query = `SELECT otp FROM otp_verified WHERE email = ? AND phone = ? ORDER BY id DESC LIMIT 1`;
        const [result] = await db.promise().query(query, [email, phone]);

        // Check if the OTP matches
        if (result.length === 0 || result[0].otp !== String(otp)) {
            return false;
        }
        return true;
    }

    static async createUser(firstName, lastName, email, hashedPassword, phone, pincode, userState, isEighteen, isRefer = 0, userRefcode = null, adminRefcode = null, ipAddress) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        let query = `INSERT INTO tbl_registration 
            (first_name, email, password, phone, pincode, state, is_eighteen, is_verified, isRefer, isRefer_to, admin_referral, user_status, created, modified, ip_address, status, ip_status, bonus_league_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        let queryParams = [firstName, email, hashedPassword, phone, pincode, userState, isEighteen, 1, isRefer, userRefcode, adminRefcode, "active", istTime, istTime, ipAddress, 1, 1, 1];

        if (lastName) {
            query = `INSERT INTO tbl_registration 
                (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, isRefer, isRefer_to, admin_referral, user_status, created, modified, ip_address, status, ip_status, bonus_league_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            queryParams = [firstName, lastName, email, hashedPassword, phone, pincode, userState, isEighteen, 1, isRefer, userRefcode, adminRefcode, "active", istTime, istTime, ipAddress, 1, 1, 1];
        }

        const [result] = await db.promise().query(query, queryParams);
        return result;
    }

    static async updateUser(LastUserID, arrData) {
        const [result] = await db.promise().query(
            `UPDATE tbl_registration SET referral_code = ? WHERE id = ?`,
            [arrData.referral_code, LastUserID]

        );
        return result;
    }

    static async insertReferralHistory(referralAmount, referalUid, refertoUid, adminRefcode) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const [result] = await db.promise().query(
            `INSERT INTO tbl_referral_history (referal_amount, referal_uid, referto_uid, admin_referral, modified) VALUES (?, ?, ?, ?, ?)`,
            [referralAmount, referalUid, refertoUid, adminRefcode, istTime]
        );
        return result.insertId;
    }

    // Insert bonus history into the database
    static async insertBonusHistory(referaalId, userId, creditBonus, totalBonus, bonusType, bonusStatus, adminRefcode) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const [result] = await db.promise().query(
            `INSERT INTO tbl_bonus_history (rid, user_id, credit_bonus, total_bonus, bonus_type, bonus_status, admin_referral, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [referaalId, userId, creditBonus, totalBonus, bonusType, bonusStatus, adminRefcode, istTime]
        );
        return result;
    }

    static getLoginQuery(phone) {
        const query = `SELECT * FROM tbl_registration WHERE phone = '${phone}'`;
        return query;
    }

    // static async updateSessionToken(userId, accessToken, refreshToken) {
    //     const query = `UPDATE tbl_registration SET session_token = ?, refresh_token = ? WHERE id = ?`;
    //     return db.execute(query, [accessToken, refreshToken, userId]);
    // }
    
    static async updateSessionToken(userId, accessToken, refreshToken) {
        const query = `UPDATE tbl_registration SET session_token = ?, refresh_token = ? WHERE id = ?`;
        // ADDED await and .promise()
        const [result] = await db.promise().execute(query, [accessToken, refreshToken, userId]);
        return result;
    }
    
    static async insertinLog(logData) {
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
        const [result] = await db.promise().query(
            `INSERT INTO temp_login_log 
            (phone, password, result, query, ip_address, browser_info, api_response, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                logData.phone,
                logData.password,
                logData.result,
                logData.query,
                logData.ip_address,
                logData.browser_info,
                logData.api_response,
                istTime
            ]
        );
    
        return result;
    }

    // static async insertinLog(logData) {
    //     // Get the current time in IST
    //     const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

    //     const [result] = await db.promise().query(
    //         `INSERT INTO temp_login_log (phone, password, result, query, ip_address, browser_info, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    //         [logData.phone, logData.password, logData.result, logData.query, logData.ip_address, logData.browser_info, istTime]
    //     );
    //     return result;
    // }

    static async updateUserIpAddress(ipAddress, phone) {
        try {
            const [result] = await db.promise().query(
                `UPDATE tbl_registration SET ip_address = ? WHERE phone = ?`,
                [ipAddress, phone]
            );
            return result;
        } catch (error) {
            console.error('Error updating user IP address:', error);
            throw new Error('Error updating user IP address');
        }
    }

    static async fetchBonusLeagueInfo(userId) {
        try {
            // Step 1: Get bonus_league_id from tbl_registration
            const leagueQuery = `SELECT bonus_league_id FROM tbl_registration WHERE id = ?`;
            const [leagueResult] = await db.promise().query(leagueQuery, [userId]);

            if (!leagueResult.length || !leagueResult[0].bonus_league_id) {
                return null; // Return null if no league ID found
            }

            const bonusLeagueId = leagueResult[0].bonus_league_id;

            // Step 2: Get league_name from tbl_bonus_league using bonus_league_id
            const nameQuery = `SELECT league_name FROM tbl_bonus_league WHERE id = ?`;
            const [nameResult] = await db.promise().query(nameQuery, [bonusLeagueId]);

            return nameResult.length ? nameResult[0].league_name : null;
        } catch (error) {
            console.error('Error updating user IP address:', error);
            throw new Error('Error fetching bonus league info');
        }
    }

    static async TotalEarnAmount(userId) {
        try {
            const query = `SELECT SUM(credit_amount) AS total_earnings FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Win'`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_earnings || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching total earnings');
        }
    }

    static async TotalReferralAmount(userId) {
        try {
            const query = `SELECT SUM(referal_amount) AS total_referal_earnings FROM tbl_referral_history WHERE referto_uid = ?`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_referal_earnings || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching total earnings');
        }
    }

    static async changeUserPassword(hashedPassword, userId) {
        try {
            const query = `UPDATE tbl_registration SET password = ? WHERE id = ?`;
            const [result] = await db.promise().query(query, [hashedPassword, userId]);
            return result;
        } catch (error) {
            console.error('Error updating user password:', error);
            throw new Error('Error updating user password');
        }
    }

    static async updateProfile(userId, profileData) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        let query = `UPDATE tbl_registration SET first_name = ?, profile_image = ?, modified = ?`;
        let queryParams = [profileData.first_name, profileData.profile_image, istTime];

        if (profileData.last_name) {
            query += `, last_name = ?`;
            queryParams.push(profileData.last_name);
        }

        query += ` WHERE id = ?`;
        queryParams.push(userId);

        const [result] = await db.promise().query(query, queryParams);
        return result;
    }

    static async addAccount(userId, accountData) {
        // Step 1: Update existing accounts to remove primary status
        const updateQuery = `UPDATE tbl_user_account SET primary_account = 0 WHERE user_id = ?`;
        const [updateResult] = await db.promise().query(updateQuery, [userId]);

        // Check if update was successful (affectedRows > 0 means rows were updated)
        if (updateResult.affectedRows >= 0) {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            // Step 2: Insert the new account with primary_account = 1
            const insertQuery = `
                INSERT INTO tbl_user_account 
                (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, addhar_number, upi_id, phone_pay, g_pay, paytm, primary_account, modified) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `;

            const values = [
                userId,
                accountData.bank_name,
                accountData.account,
                accountData.ifsc_code,
                accountData.holder_name,
                accountData.account_type,
                accountData.addhar_number,
                accountData.upi_id,
                accountData.phone_pay,
                accountData.g_pay,
                accountData.paytm,
                istTime
            ];

            const [insertResult] = await db.promise().query(insertQuery, values);
            return insertResult;
        } else {
            throw new Error("Failed to update existing accounts.");
        }
    }

    static async fetchAccountDetails(userId) {
        const query = `SELECT * FROM tbl_user_account WHERE user_id = ? and primary_account=1 LIMIT 1`;

        const [result] = await db.promise().query(query, [userId]);
        return result;
    }

    static async findUserByRefreshToken(refreshToken) {
        const query = `SELECT id FROM tbl_registration WHERE refresh_token = ?`;
        const [result] = await db.promise().query(query, [refreshToken]);
        return result[0] || null;
    }

    static async clearRefreshToken(userId) {
        const query = `UPDATE tbl_registration SET refresh_token = NULL WHERE id = ?`;
        await db.promise().query(query, [userId]);
    }
}

module.exports = UserModel;