const matchIdModel = require('../models/matchIdModel');
const matchIdPasswordChangeReqModel = require('../models/matchIdPasswordChangeReqModel');
const sendMail = require('../helpers/sendMail');
const { notifyAdmin } = require('../helpers/notifyAdmin');

class MatchIdService {
    static async demoSitesListing(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const siteData =
                await matchIdModel.demoSitesListingData(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.demoSitesListingCount();
    
            return { siteData, totalCount };
    
        } catch (error) {
            console.error('Error in Demo Sites Service:', error.message);
            throw new Error('Failed to fetch demo sites');
        }
    }
    
    static async checkExistingPendingRequest(userId, siteId) {
        try {
            return await matchIdModel.checkExistingPendingRequest(
                userId,
                siteId
            );
        } catch (error) {
            console.error('Error checking existing match id request:', error.message);
            throw new Error('Failed to check existing match id request');
        }
    }
    
    static async createMatchIdRequest(userId, siteId, requestedAmount) {
        try {
            // insert request
            const matchIdReqId = await matchIdModel.insertMatchIdRequest(
                userId,
                siteId,
                requestedAmount
            );
    
            // fetch user + site details
            const user = await matchIdModel.getUserSiteDetails(userId, siteId);
    
            if (user) {
    
                const emailContent = `
                    <h3>New Match ID Request</h3>
                    <p><strong>User:</strong> ${user.first_name} ${user.last_name} (${user.phone})</p>
                    <p><strong>Site Name:</strong> ${user.site_name}</p>
                    <p><strong>Requested Amount:</strong> ₹${requestedAmount}</p>
                    <p><strong>Transfer Type:</strong> New ID (APP -> ID)</p>
                `;
    
                try {
                    await sendMail(
                        'matchid459@gmail.com',
                        'New Match ID Request',
                        emailContent
                    );
                } catch (mailErr) {
                    console.error('Email sending failed:', mailErr.message);
                }
            }
    
            return matchIdReqId;
        } catch (error) {
            console.error('Error in Match ID Service:', error.message);
            throw new Error('Failed to create match id request');
        }
    }
    
    static async getUserMatchIds(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const matchData =
                await matchIdModel.getUserMatchIdsData(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.getUserMatchIdsCount(userId);
    
            return { matchData, totalCount };
    
        } catch (error) {
            console.error('Error in MatchID Service:', error.message);
            throw new Error('Failed to fetch match ids');
        }
    }
    
    static async checkExistingTransferReq(userId, siteId, transferType) {
        try {
            return await matchIdModel.checkExistingTransferReq(userId, siteId, transferType);
        } catch (error) {
            console.error('Error checking existing transfer request:', error.message);
            throw new Error('Failed to check existing transfer request');
        }
    }
    
    static async createTransferReq(userId, siteId, transferType, amount) {
        try {
            // Insert transfer request
            const result = await matchIdModel.insertTransferReq(
                userId,
                siteId,
                transferType,
                amount
            );

            // Fire live toast to eligible admins (fire-and-forget; never throws).
            // Admin backend decides recipients based on match-id permissions.
            const { notifyAdmin } = require('../helpers/notifyAdmin');
            notifyAdmin('match_id_transfer_request', {
                user_id: userId,
                site_id: siteId,
                transfer_type: transferType,
                amount: Number(amount || 0),
            });

            // Fetch user + site details
            const user = await matchIdModel.getUserSiteDetails(userId, siteId);
    
            if (user) {
    
                const emailContent = `
                    <h3>New Transfer Request</h3>
                    <p><strong>User:</strong> ${user.first_name} ${user.last_name} (${user.phone})</p>
                    <p><strong>Site Name:</strong> ${user.site_name}</p>
                    <p><strong>Requested Amount:</strong> ₹${amount}</p>
                    <p><strong>Transfer Type:</strong> ${transferType}</p>
                `;
    
                try {
                    await sendMail(
                        'matchid459@gmail.com',
                        'New Transfer Request',
                        emailContent
                    );
                } catch (mailErr) {
                    console.error('Email sending failed:', mailErr.message);
                }
            }
    
            return result;
    
        } catch (error) {
            console.error('Error in Transfer Service:', error.message);
            throw new Error('Failed to create transfer request');
        }
    }
    
    static async supportChatsListing(userId) {
        try {
            return await matchIdModel.supportChatsListing(userId);
        } catch (error) {
            console.error('Error in Support Chat Service:', error.message);
            throw new Error('Failed to fetch support chats');
        }
    }
    static async getConsecutiveUserMessages(userId) {
        try {
            return await matchIdModel.getConsecutiveUserMessages(userId);
        } catch (error) {
            console.error('Error checking consecutive messages:', error.message);
            throw new Error('Failed to validate consecutive messages');
        }
    }
    
    static async sendSupportMessage(userId, message) {
        try {
            return await matchIdModel.insertSupportMessage( userId, message );
        } catch (error) {
            console.error('Error in Support Message Service:', error.message);
            throw new Error('Failed to send support message');
        }
    }
    
    // ================= TRANSFER HISTORY =================
    static async transferHistory(userId, page, perPage) {
        try {
            const start = (page - 1) * perPage;
    
            const history =
                await matchIdModel.transferHistoryListing(
                    userId,
                    start,
                    perPage
                );
    
            const totalCount =
                await matchIdModel.transferHistoryCount(userId);
    
            return { history, totalCount };
    
        } catch (error) {
            console.error('Error in Transfer History Service:', error.message);
            throw new Error('Failed to fetch transfer history');
        }
    }
    
    // static async cancelTransferRequest(transfer_id) {
    //     try {
    //         return await matchIdModel.cancelTransferRequest(transfer_id );
    //     } catch (error) {
    //         console.error('Error in Support Message Service:', error.message);
    //         throw new Error('Failed to send support message');
    //     }
    // }

    static async cancelTransferRequest(transfer_id,rejection_reason) {
        try {
            return await matchIdModel.cancelTransferRequest(transfer_id,rejection_reason );
        } catch (error) {
            console.error('Error in Support Message Service:', error.message);
            throw new Error('Failed to send support message');
        }
    }

    // ================= MATCH ID PASSWORD CHANGE REQUEST =================
    //
    // Create a pending password-change request for the caller's own Match ID
    // on `siteId`. Validates:
    //   - the user actually owns a Match ID for that site (backend guard,
    //     required by spec § 1)
    //   - no other pending request already exists for the same (user, site)
    //
    // Fires an admin-side toast via notifyAdmin('match_id_password_change_request', {...})
    // so admins with password_change_request_access see it live.
    //
    // Returns { success: boolean, message: string, code?: 'not_found'|'duplicate' }
    static async createPasswordChangeReq(userId, siteId) {
        try {
            const uid = Number(userId);
            const sid = Number(siteId);
            if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(sid) || sid <= 0) {
                return { success: false, message: 'Invalid request', code: 'invalid' };
            }

            const owns = await matchIdPasswordChangeReqModel.userOwnsMatchIdForSite(uid, sid);
            if (!owns) {
                return {
                    success: false,
                    message: 'Match ID for this site not found on your account',
                    code: 'not_found'
                };
            }

            const hasPending = await matchIdPasswordChangeReqModel.hasPendingRequest(uid, sid);
            if (hasPending) {
                return {
                    success: false,
                    message: 'A password change request is already pending for this Match ID',
                    code: 'duplicate'
                };
            }

            // getUserSiteDetails returns first_name/last_name/phone/site_name — we
            // reuse it here so the notifyAdmin payload can carry the site name.
            const details = await matchIdModel.getUserSiteDetails(uid, sid);

            const inserted = await matchIdPasswordChangeReqModel.insert(uid, sid);

            // Fire-and-forget admin toast (never throws to caller).
            notifyAdmin('match_id_password_change_request', {
                user_id: uid,
                site_id: sid,
                site_name: details?.site_name || '',
                request_id: inserted.id,
            });

            return {
                success: true,
                message: 'Password change request submitted successfully',
            };
        } catch (error) {
            console.error('Error in Password Change Req Service:', error.message);
            throw new Error('Failed to submit password change request');
        }
    }

    // Idempotent acknowledgement — user browser calls this after rendering
    // the updated password row. Returns quietly whether or not there was
    // anything to mark seen.
    static async markPasswordSeen(userId, siteId) {
        try {
            const uid = Number(userId);
            const sid = Number(siteId);
            if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(sid) || sid <= 0) {
                return { success: false, message: 'Invalid request' };
            }
            await matchIdPasswordChangeReqModel.markPasswordSeen(uid, sid);
            return { success: true, message: 'ok' };
        } catch (error) {
            console.error('Error in Password Seen Service:', error.message);
            throw new Error('Failed to acknowledge password update');
        }
    }
}

module.exports = MatchIdService;