const db = require('../config/database');
const moment = require('moment-timezone');

class MatchIdModel {
    // Fetch demo sites list
    static async demoSitesListingData(userId, start, perPage) {
        let query = `
            SELECT ds.id, ds.site_name, ds.site_logo, ds.site_link, ds.site_info,
                CASE 
                    WHEN umi.site_id IS NOT NULL 
                    THEN true 
                    ELSE false 
                END AS has_match_id     -- has_match_id = 1=>User have the match id for the site,0=>User don't have match id for the site --
            FROM tbl_demo_sites ds
            LEFT JOIN tbl_user_match_ids umi
                ON ds.id = umi.site_id
                AND umi.user_id = ?
            WHERE ds.status = 1
            ORDER BY 
                CASE 
                    WHEN ds.id = 12 THEN 2.5
                    ELSE ds.id
                END ASC
        `;
    
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] =
                await db.promise().query(query, [
                    userId,
                    start,
                    perPage
                ]);
            return rows;
        }
    
        const [rows] =
            await db.promise().query(query, [userId]);
    
        return rows;
    }

    // Fetch demo sites count
    static async demoSitesListingCount() {
        let query = `SELECT COUNT(*) AS total FROM tbl_demo_sites`;

        const [result] = await db.promise().query(query);
        return result[0].total;
    }
    
    static async checkExistingPendingRequest(userId, siteId) {
        const query = `
            SELECT id FROM tbl_match_id_reqs
            WHERE user_id = ? AND site_id = ? AND status = 'pending'
            LIMIT 1
        `;
    
        const [rows] = await db.promise().query(query, [
            userId,
            siteId
        ]);
    
        return rows.length > 0;
    }
    
    static async insertMatchIdRequest(userId, siteId, requestedAmount) {
        const connection = await db.promise().getConnection();

        try {
            await connection.beginTransaction();
    
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
            // 🔹 Insert into tbl_match_id_reqs
            const insertMatchQuery = `
                INSERT INTO tbl_match_id_reqs
                (user_id, site_id, requested_amount, status, created_at)
                VALUES (?, ?, ?, 'pending', ?)
            `;
    
            const [matchResult] = await connection.query(
                insertMatchQuery,
                [userId, siteId, requestedAmount, istTime]
            );
    
            const matchIdReqId = matchResult.insertId;
    
            // 🔹 Insert into tbl_transfer_requests
            const insertTransferQuery = `
                INSERT INTO tbl_transfer_requests
                (user_id, site_id, match_id_req_id, transfer_mode, amount, status, created_at)
                VALUES (?, ?, ?, 'app_to_id', ?, 'pending', ?)
            `;
    
            await connection.query(
                insertTransferQuery,
                [userId, siteId, matchIdReqId, requestedAmount, istTime]
            );
    
            // 🔹 Commit transaction
            await connection.commit();
    
            return matchIdReqId;
        } catch (error) {
            // 🔹 Rollback on any failure
            await connection.rollback();
            console.error('Transaction failed:', error.message);
            throw error;
        } finally {
            // 🔹 Always release connection
            connection.release();
        }
    }
    
    static async getUserSiteDetails(userId, siteId) {
        const query = `
            SELECT u.first_name, u.last_name, u.phone, ds.site_name
            FROM tbl_registration u
            JOIN tbl_demo_sites ds ON ds.id = ? WHERE u.id = ?
        `;
    
        const [rows] = await db.promise().query(query, [siteId, userId]);
        return rows[0];
    }
    
    static async getUserMatchIdsData(userId, start, perPage) {
        let query = `
            SELECT 
                umi.match_username, umi.match_password, umi.site_id,
                ds.site_name,ds.site_link,ds.status
            FROM tbl_user_match_ids umi
            LEFT JOIN tbl_demo_sites ds 
                ON ds.id = umi.site_id
            WHERE umi.user_id = ?
            ORDER BY umi.id DESC
        `;
    
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [
                userId,
                start,
                perPage
            ]);
            return rows;
        }
    
        const [rows] = await db.promise().query(query, [userId]);
        return rows;
    }
    
    static async getUserMatchIdsCount(userId) {
        const query = `SELECT COUNT(*) AS total FROM tbl_user_match_ids WHERE user_id = ?`;
    
        const [result] = await db.promise().query(query, [userId]);
    
        return result[0].total;
    }
    
    static async checkExistingTransferReq(userId, siteId, transferType) {
        const query = `
            SELECT id FROM tbl_transfer_requests
            WHERE user_id = ? AND site_id = ? AND transfer_mode = ? AND status = 'pending'
            LIMIT 1
        `;
    
        const [rows] = await db.promise().query(query, [ userId, siteId, transferType ]);
    
        return rows.length > 0;
    }
    
    static async insertTransferReq(userId, siteId, transferType, amount) {
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
        const query = `
            INSERT INTO tbl_transfer_requests
            (user_id, site_id, transfer_mode, amount, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
        `;
    
        const [result] = await db.promise().query(query, [
            userId,siteId,transferType,amount,istTime
        ]);
    
        return result;
    }
    
    static async supportChatsListing(userId) {
        const query = `
            SELECT 
                sc.id, sc.message, sc.created_at,
                ad.name AS admin_name
            FROM tbl_support_chats sc
            LEFT JOIN tbl_admin ad 
                ON ad.id = sc.admin_id
            WHERE sc.user_id = ?
            ORDER BY sc.id DESC
            LIMIT 6
        `;
    
        const [rows] = await db.promise().query(query, [userId]);
    
        return rows.reverse();
    }
    
    static async getConsecutiveUserMessages(userId) {
        const query = `SELECT admin_id FROM tbl_support_chats WHERE user_id = ? ORDER BY id DESC LIMIT 10`;
        const [rows] = await db.promise().query(query, [userId]);
    
        let count = 0;
    
        for (const row of rows) {
            // stop when admin reply found
            if (row.admin_id !== null) {
                break;
            }
            count++;
        }
        return count;
    }
    
    static async insertSupportMessage(userId, message) {
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
        const query = `INSERT INTO tbl_support_chats (user_id, message, created_at) VALUES (?, ?, ?)`;
    
        const [result] = await db.promise().query(query, [
            userId,
            message,
            istTime
        ]);
    
        return result;
    }
    
        // ================= TRANSFER HISTORY =================

    static async transferHistoryListing(userId, start, perPage) {
        const query = `
            SELECT 
                tr.id,
                tr.site_id,
                ds.site_name,
                tr.transfer_mode,
                tr.amount,
                tr.rejection_reason,  -- ✅ FIX
                tr.status,
                tr.created_at
            FROM tbl_transfer_requests tr
            LEFT JOIN tbl_demo_sites ds 
                ON ds.id = tr.site_id
            WHERE tr.user_id = ?
            ORDER BY tr.id DESC
            LIMIT ?, ?
        `;
    
        const [rows] = await db.promise().query(query, [
            userId,
            start,
            perPage
        ]);
    
        return rows;
    }
    
    static async transferHistoryCount(userId) {
        const query = `
            SELECT COUNT(*) AS total
            FROM tbl_transfer_requests
            WHERE user_id = ?
        `;
    
        const [result] = await db.promise().query(query, [userId]);
        return result[0].total;
    }
    
    static async cancelTransferRequest(transfer_id) {
        const connection = await db.promise().getConnection();
        try {
            await connection.beginTransaction();
    
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
            /* ===== FETCH TRANSFER WITH LOCK ===== */
            const [rows] = await connection.query(
                `SELECT id, match_id_req_id, status, in_process 
                 FROM tbl_transfer_requests 
                 WHERE id = ? 
                 LIMIT 1 
                 FOR UPDATE`,
                [transfer_id]
            );
    
            if (!rows.length) {
                throw new Error("TRANSFER_NOT_FOUND");
            }
    
            const transferRow = rows[0];
    
            /* ===== STATUS CHECKS ===== */
    
            // Already rejected
            if (transferRow.status === 'rejected' || transferRow.status === 'cancel') {
                await connection.rollback();
                return { state: 'already_rejected' };
            }
    
            // Already approved
            if (transferRow.status === 'approved') {
                await connection.rollback();
                return { state: 'already_approved' };
            }
    
            /* ===== CHECK TRANSFER in_process ===== */
            if (transferRow.in_process == 1) {
                await connection.rollback();
                return { state: 'in_process' };
            }
    
            /* ===== CHECK MATCH REQUEST in_process ===== */
            if (transferRow.match_id_req_id) {
    
                const [reqRows] = await connection.query(
                    `SELECT id, in_process, status 
                     FROM tbl_match_id_reqs 
                     WHERE id = ? 
                     LIMIT 1 
                     FOR UPDATE`,
                    [transferRow.match_id_req_id]
                );
    
                if (reqRows.length) {
    
                    // If already processing → block cancel
                    if (reqRows[0].in_process == 1) {
                        await connection.rollback();
                        return { state: 'in_process' };
                    }
    
                    // If already approved → block cancel
                    if (reqRows[0].status === 'approved') {
                        await connection.rollback();
                        return { state: 'already_approved' };
                    }
                }
            }
    
            /* ===== CANCEL TRANSFER REQUEST ===== */
            await connection.query(
                `UPDATE tbl_transfer_requests
                 SET status = 'cancel',
                     in_process = 0,
                     updated_at = ?
                 WHERE id = ?`,
                [istTime, transfer_id]
            );
    
            /* ===== CANCEL MATCH REQUEST (IF EXISTS) ===== */
            if (transferRow.match_id_req_id) {
                await connection.query(
                    `UPDATE tbl_match_id_reqs
                     SET status = 'cancel',
                         in_process = 0,
                         updated_at = ?
                     WHERE id = ?`,
                    [istTime, transferRow.match_id_req_id]
                );
            }
    
            await connection.commit();
    
            return { state: 'rejected' };
    
        } catch (error) {
            await connection.rollback();
            console.error("Cancel request transaction failed:", error.message);
            throw error;
    
        } finally {
            connection.release();
        }
    }
    
    // static async cancelTransferRequest(transfer_id) {
    //     const connection = await db.promise().getConnection();
    //     try {
    //         await connection.beginTransaction();
    
    //         const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    
    //         // Fetch transfer row
    //         const [rows] = await connection.query(`SELECT id, match_id_req_id, status FROM tbl_transfer_requests WHERE id = ? LIMIT 1`, [transfer_id] );
    
    //         if (!rows.length) {
    //             throw new Error("TRANSFER_NOT_FOUND");
    //         }
    
    //         const transferRow = rows[0];
    
    //         // Aready rejected
    //         if (transferRow.status === 'rejected') {
    //             await connection.rollback();
    //             return { state: 'already_rejected' };
    //         }
    
    //         // Already approved
    //         if (transferRow.status === 'approved') {
    //             await connection.rollback();
    //             return { state: 'already_approved' };
    //         }
            
    //         /* -------- CHECK IN_PROCESS -------- */
    //         if (transferRow.match_id_req_id) {
    //             const [reqRows] = await connection.query(
    //                 `SELECT in_process 
    //                  FROM tbl_match_id_reqs 
    //                  WHERE id = ? 
    //                  LIMIT 1`,
    //                 [transferRow.match_id_req_id]
    //             );
    //             if (reqRows.length && reqRows[0].in_process == 1) {
    //                 await connection.rollback();
    //                 return { state: 'in_process' };
    //             }
    //         }
    
    //         // Only pending reaches here
    //         /* -------- CANCEL TRANSFER -------- */
    //         await connection.query(
    //             `UPDATE tbl_transfer_requests
    //              SET status = 'cancel', updated_at = ?
    //              WHERE id = ?`,
    //             [istTime, transfer_id]
    //         );
    
    //         if (transferRow.match_id_req_id) {
    //             await connection.query(
    //                 `UPDATE tbl_match_id_reqs
    //                  SET status = 'cancel', updated_at = ?
    //                  WHERE id = ?`,
    //                 [istTime, transferRow.match_id_req_id]
    //             );
    //         }
    
    //         await connection.commit();
    
    //         return { state: 'rejected' };
    
    //     } catch (error) {
    //         await connection.rollback();
    //         console.error("Cancel request transaction failed:", error.message);
    //         throw error;
    
    //     } finally {
    //         connection.release();
    //     }
    // }
}

module.exports = MatchIdModel;