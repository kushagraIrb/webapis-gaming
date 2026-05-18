const db = require('../config/database');
const moment = require('moment');

class DepositModel {
    // Fetch deposit history for a user with pagination
    static async getDepositHistory(userId, start, perPage) {
        let query = `SELECT  deposit_id, deposit_screenshot, deposit_amount_step1 AS deposit_amount, status, approved_date AS created_date FROM tbl_deposit_list WHERE user_id = ? AND status = 1 UNION SELECT  deposit_id, deposit_screenshot, deposit_amount_step1 AS deposit_amount, status, created_date FROM tbl_deposit_log WHERE user_id = ? AND status = 2 ORDER BY created_date DESC`;

        // Add pagination if required
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, userId, start, perPage]);
            return rows;
        }

        // Fetch all data if no pagination
        const [rows] = await db.promise().query(query, [userId, userId]);
        return rows;
    }

    // Get total count of deposits for a user
    static async getDepositCount(userId) {
        let query = `SELECT COUNT(*) AS total 
                    FROM tbl_deposit_list WHERE user_id = ? AND status = 1 
                    UNION 
                    SELECT COUNT(*) AS total 
                    FROM tbl_deposit_log WHERE user_id = ? AND status = 2`;

        const [[result]] = await db.promise().query(query, [userId, userId]);
        return result.total;
    }

    // Fetch Admin Bank Account based on the deposit amount
    static async getRange(conn, depositAmount) {
        const [rows] = await conn.query(
            `SELECT * FROM tbl_bank_ranges 
             WHERE ? BETWEEN min_amount AND max_amount 
             AND status = 1 
             LIMIT 1`,
            [depositAmount]
        );
    
        return rows[0];
    }
    
    static async getEligibleGroup(conn, range_id, depositAmount) {
        const today = moment().format('YYYY-MM-DD');
        
        // 1. GET RANGE DETAILS
        const [rangeRows] = await conn.query(`SELECT * FROM tbl_bank_ranges WHERE id = ? LIMIT 1`, [range_id]);
    
        const range = rangeRows[0];
    
        if (!range) {
            return null;
        }
    
        // 2. FORMAT UNIVERSAL ACTIVE DATE
        const universalDate = range.universal_group_active_date
            ? moment(range.universal_group_active_date).format('YYYY-MM-DD')
            : null;

        // 3. RESET UNIVERSAL FLAG IF OLD DATE
        if (range.universal_group_active == 1 && universalDate !== today) {
            await conn.query(`UPDATE tbl_bank_ranges SET universal_group_active = 0 WHERE id = ?`, [range_id]);
            range.universal_group_active = 0;
        }
    
        // 4. UNIVERSAL GROUP ACTIVE TODAY
        if (range.universal_group_active == 1 && universalDate === today) {
            const [universal] = await conn.query(
                `SELECT * FROM tbl_bank_groups
                 WHERE range_id = ? AND priority = 0 AND is_active = 1
                 LIMIT 1`,
                [range_id]
            );
    
            return universal[0] || null;
        }
    
        // 5. NORMAL GROUP FLOW
        const [groups] = await conn.query(
            `SELECT * FROM tbl_bank_groups
             WHERE range_id = ? AND priority > 0 AND is_active = 1
             ORDER BY priority ASC`,
            [range_id]
        );
    
        for (const group of groups) {
            const remaining = parseFloat(group.max_daily_amount) - parseFloat(group.consumed_amount);
    
            if (parseFloat(depositAmount) <= remaining) {
                return group;
            }
        }
    
        // 6. ACTIVATE UNIVERSAL GROUP
        await conn.query(
            `UPDATE tbl_bank_ranges
             SET universal_group_active = 1,
                 universal_group_active_date = CURDATE()
             WHERE id = ?`,
            [range_id]
        );
    
        const [universal] = await conn.query(
            `SELECT * 
             FROM tbl_bank_groups
             WHERE range_id = ?
             AND priority = 0
             AND is_active = 1
             LIMIT 1`,
            [range_id]
        );
    
        return universal[0] || null;
    }
    
    static async getBankFromGroup(conn, group) {
        const remainingGroupAmount = parseFloat(group.max_daily_amount) - parseFloat(group.consumed_amount);
    
        // 1. try unused bank
        let [accounts] = await conn.query(
            `SELECT bd.*, bga.bank_id
             FROM tbl_bank_group_accounts bga
             JOIN tbl_bank_details bd
                ON bd.id = bga.bank_id
             WHERE bga.group_id = ?
             AND bga.is_chosen = 0
             AND bd.status = 1
             ORDER BY bd.id ASC
             LIMIT 1
             FOR UPDATE`,
            [group.id]
        );
    
        let bank = accounts[0];
    
        // 2. RESET ONLY IF GROUP STILL ACTIVE
        if (!bank && remainingGroupAmount > 0) {
            await conn.query(
                `UPDATE tbl_bank_group_accounts
                 SET is_chosen = 0
                 WHERE group_id = ?
                 AND is_chosen = 1`,
                [group.id]
            );
    
            [accounts] = await conn.query(
                `SELECT bd.*, bga.bank_id
                 FROM tbl_bank_group_accounts bga
                 JOIN tbl_bank_details bd
                    ON bd.id = bga.bank_id
                 WHERE bga.group_id = ?
                 AND bd.status = 1
                 ORDER BY bd.id ASC
                 LIMIT 1`,
                [group.id]
            );
    
            bank = accounts[0];
        }
    
        if (!bank) return null;
    
        await conn.query(
            `UPDATE tbl_bank_group_accounts
             SET is_chosen = 1
             WHERE group_id = ?
             AND bank_id = ?`,
            [group.id, bank.bank_id]
        );
    
        return bank;
    }

    static async updateConsumedAmount(conn, groupId, amount) {
        const query = `
            UPDATE tbl_bank_groups
            SET consumed_amount = consumed_amount + ?
            WHERE id = ?
            AND is_active = 1
            AND (max_daily_amount - consumed_amount) >= ?
        `;

        const [result] = await conn.query(query, [
            amount,
            groupId,
            amount
        ]);

        return result.affectedRows > 0;
    }

    static async fetchBankAccountByValue(depositAmount) {
        const conn = await db.promise().getConnection();
    
        try {
            await conn.beginTransaction();
    
            const range = await this.getRange(conn, depositAmount);
            if (!range) {
                await conn.rollback();
                conn.release();
                return { success: false, message: "Unable to fetch bank details (range)" };
            }
    
            const group = await this.getEligibleGroup(conn, range.id, depositAmount);
            if (!group) {
                await conn.rollback();
                conn.release();
                return { success: false, message: "Unable to fetch bank details group" };
            }
    
            const bank = await this.getBankFromGroup(conn, group);
            if (!bank) {
                await conn.rollback();
                conn.release();
                return { success: false, message: "Unable to fetch bank details bank" };
            }
    
            // await this.updateConsumedAmount(conn, group.id, depositAmount);
    
            await conn.commit();
            conn.release();
    
            return {
                success: true,
                data: {
                    ...bank,
                    group_id: group.id
                }
            };
    
        } catch (err) {
            await conn.rollback();
            conn.release();
    
            return {
                success: false,
                message: "Unable to fetch bank details"
            };
        }
    }

    // static async fetchBankAccountByValue(depositAmount) {
    //     try {
    //         // Initial query to find a matching bank account
    //         let query = `SELECT * FROM tbl_bank_details WHERE ? BETWEEN min_value AND max_value AND status = 1 AND chosen_flag = 0 ORDER BY id ASC LIMIT 1`;
            
    //         const [rows] = await db.promise().query(query, [parseFloat(depositAmount)]);

    //         let data = rows[0];

    //         // If no matching bank account is found, reset chosen_flag and try again
    //         if (!data) {
    //             const resetQuery = `UPDATE tbl_bank_details SET chosen_flag = 0 WHERE ? BETWEEN min_value AND max_value`;
    //             await db.promise().query(resetQuery, [parseFloat(depositAmount)]);

    //             // Retry the query after resetting chosen_flag
    //             const [retryRows] = await db.promise().query(query, [parseFloat(depositAmount)]);
    //             data = retryRows[0];

    //             // If a matching bank account is found after resetting, update its chosen_flag
    //             if (data) {
    //                 const updateQuery = `UPDATE tbl_bank_details SET chosen_flag = 1 WHERE id = ?`;
    //                 await db.promise().query(updateQuery, [data.id]);
    //             }
    //         } else {
    //             // If a matching bank account is found on the first attempt, update its chosen_flag
    //             const updateQuery = `UPDATE tbl_bank_details SET chosen_flag = 1 WHERE id = ?`;
    //             await db.promise().query(updateQuery, [data.id]);
    //         }

    //         return data;
    //     } catch (error) {
    //         console.error('Error fetching bank account by value:', error.message);
    //         throw new Error('Failed to fetch bank account');
    //     }
    // }

    static async resetBankSystem() {
        const conn = await db.promise().getConnection();
    
        try {
            await conn.beginTransaction();
    
            // 1. reset ranges
            await conn.query(`
                UPDATE tbl_bank_ranges
                SET universal_group_active = 0,
                    universal_group_active_date = NULL
            `);
    
            // 2. reset groups
            await conn.query(`
                UPDATE tbl_bank_groups
                SET consumed_amount = 0
            `);
    
            // 3. reset bank rotation
            await conn.query(`
                UPDATE tbl_bank_group_accounts
                SET is_chosen = 0
            `);
    
            await conn.commit();
            conn.release();
    
            return { success: true };
    
        } catch (err) {
            await conn.rollback();
            conn.release();
            throw err;
        }
    }

    // Check if deposit ID exists with status 1
    static async getDepositById(depositId) {
        const query = `SELECT deposit_id FROM tbl_deposit_list WHERE deposit_id = ? AND status = 1`;
        try {
            const [rows] = await db.promise().query(query, [depositId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching deposit ID:', error.message);
            throw new Error('Failed to fetch deposit data from the database');
        }
    }

    // Check if user has pending deposit request
    static async findPendingDepositByUserId(userId) {
        const query = `
            SELECT deposit_id
            FROM tbl_deposit_list
            WHERE user_id = ?
              AND status = 0
            LIMIT 1
        `;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching pending deposit:', error.message);
            throw new Error('Failed to fetch pending deposit data from the database');
        }
    }

    // Fetch pending deposit requests count (0/1 style like withdrawal API)
    static async fetchPendingRequestsCount(userId) {
        const query = `
            SELECT COUNT(*) AS pendingCount
            FROM tbl_deposit_list
            WHERE user_id = ?
              AND status = 0
        `;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0]?.pendingCount || 0;
        } catch (error) {
            console.error('Error fetching pending deposit count:', error.message);
            throw new Error('Failed to fetch pending deposit count from the database');
        }
    }

    // Check whether user already has at least one approved deposit
    static async hasApprovedDeposit(userId) {
        const query = `
            SELECT 1
            FROM tbl_deposit_list
            WHERE user_id = ?
              AND status = 1
              AND (verified = 1 OR verified IS NULL)
              AND (fake_deposit = 0 OR fake_deposit IS NULL)
            LIMIT 1
        `;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0;
        } catch (error) {
            console.error('Error checking approved deposit:', error.message);
            throw new Error('Failed to check approved deposit from the database');
        }
    }

    // Fetch user registration created timestamp
    static async getUserCreatedAt(userId) {
        const query = `SELECT created FROM tbl_registration WHERE id = ? LIMIT 1`;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0].created : null;
        } catch (error) {
            console.error('Error fetching user created timestamp:', error.message);
            throw new Error('Failed to fetch user registration timestamp from the database');
        }
    }

    // Sum user deposits created in first 24h window after registration
    static async getFirst24hDepositTotal(userId, userCreatedAt) {
        const query = `
            SELECT COALESCE(SUM(deposit_amount_step1), 0) AS total
            FROM tbl_deposit_list
            WHERE user_id = ?
              AND approved_date >= ?
              AND approved_date <= DATE_ADD(?, INTERVAL 24 HOUR)
        `;
        try {
            const [rows] = await db.promise().query(query, [userId, userCreatedAt, userCreatedAt]);
            return parseFloat(rows[0]?.total || 0);
        } catch (error) {
            console.error('Error fetching first 24h deposit total:', error.message);
            throw new Error('Failed to fetch first 24h deposit total from the database');
        }
    }

    // Debug helper to inspect how pending deposit rows are being classified
    static async getPendingDepositDiagnostics(userId) {
        try {
            const statusCountQuery = `
                SELECT
                    COUNT(*) AS total_rows,
                    SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS status_0_rows,
                    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS status_1_rows,
                    SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS pending_by_rule_rows
                FROM tbl_deposit_list
                WHERE user_id = ?
            `;

            const rowsPreviewQuery = `
                SELECT
                    id,
                    deposit_id,
                    deposit_amount_step1,
                    status,
                    COALESCE(verified, 0) AS verified,
                    COALESCE(fake_deposit, 0) AS fake_deposit,
                    approved_date,
                    deposit_date
                FROM tbl_deposit_list
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 20
            `;

            const [countRows] = await db.promise().query(statusCountQuery, [userId]);
            const [previewRows] = await db.promise().query(rowsPreviewQuery, [userId]);

            return {
                summary: countRows[0] || {},
                latest_rows: previewRows || [],
            };
        } catch (error) {
            console.error('Error fetching deposit diagnostics:', error.message);
            throw new Error('Failed to fetch deposit diagnostics from the database');
        }
    }

    // Save deposit
    static async saveDeposit(conn, data) {
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `
            INSERT INTO tbl_deposit_list
            (deposit_id, deposit_amount, deposit_amount_step1, deposit_date, deposit_screenshot, bank_owner_name, status, user_id, approved_date)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `;

        const values = [data.deposit_id, data.deposit_amount, data.deposit_amount_step1, data.deposit_date, data.deposit_screenshot, data.bank_owner_name, data.userId, istTime];

        const [result] = await conn.query(query, values);
        return result;
    }

    // Get user available balance
    static async getUserAvailableBalance(userId) {
        const query = `SELECT total_amount FROM tbl_transaction_history WHERE user_id = ? ORDER BY trans_id DESC LIMIT 1`;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0].total_amount : 0;
        } catch (error) {
            console.error('Error fetching user balance:', error.message);
            throw new Error('Failed to fetch user balance from the database');
        }
    }

    // Save transaction history
    static async saveTransactionHistory(conn, data) {
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `
            INSERT INTO tbl_transaction_history
            (transaction_pk, transaction_id, user_id, credit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id)
            VALUES (?, ?, ?, ?, ?, 'Credit', 'Deposit', ?, ?)
        `;

        const values = [data.transaction_pk, data.transaction_id, data.userId, data.credit_amount, data.total_amount, istTime, data.bonus_league_id];

        const [result] = await conn.query(query, values);
        return result;
    }

    // Update user highlight row
    static async updateUserHighlight(conn, userId) {
        const query = `UPDATE tbl_registration SET highlight_row = 0 WHERE id = ?`;

        const [result] = await conn.query(query, [userId]);
        return result;
    }

    // Save deposit log
    static async insertDepositLog(data) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
        
        const query = `INSERT INTO tbl_deposit_log (deposit_id, deposit_amount, deposit_amount_step1, deposit_date, ss_time_frame, deposit_screenshot, user_id, status, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [
            data.deposit_id,
            data.deposit_amount,
            data.deposit_amount_step1,
            data.deposit_date,
            data.ss_time_frame,
            data.deposit_screenshot,
            data.userId,
            data.status,
            istTime
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw new Error('Failed to save deposit data to the database');
        }
    }
}

module.exports = DepositModel;
