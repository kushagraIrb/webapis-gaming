const db = require('../config/database');
const { logger } = require('../logger');

// Which features an admin has switched on for which users (Admin Area > Feature Launch in the admin panel;
// tables created by gamingAdminNode/migrations/20261029-feature-launch.sql).
//
// A feature is on for a user only while it is live AND either it was launched to everyone, or the user is in its
// list (the users of the launched categories at the moment each stage went live). Anything that goes wrong
// reading this (tables not created yet, database error) means "off": the user simply gets the site as it was
// before the feature existed.

let lastErrorLoggedAt = 0;
function logReadFailure(error) {
    // not on every request: a missing table would otherwise fill the log
    if (Date.now() - lastErrorLoggedAt < 5 * 60 * 1000) return;
    lastErrorLoggedAt = Date.now();
    logger.error(`Feature launch lookup failed, treating features as off: ${error.message}`);
}

class FeatureModel {
    static async isLiveForUser(featureKey, userId) {
        try {
            const [rows] = await db.promise().query(
                `SELECT 1
                 FROM tbl_feature f
                 LEFT JOIN tbl_feature_user fu ON fu.feature_id = f.id AND fu.user_id = ?
                 WHERE f.feature_key = ? AND f.status = 'live' AND (f.is_everyone = 1 OR fu.user_id IS NOT NULL)
                 LIMIT 1`,
                [userId, featureKey]
            );
            return rows.length > 0;
        } catch (error) {
            logReadFailure(error);
            return false;
        }
    }

    // The keys of every feature that is on for this user (for the website to show or hide things).
    static async liveKeysForUser(userId) {
        try {
            const [rows] = await db.promise().query(
                `SELECT f.feature_key
                 FROM tbl_feature f
                 LEFT JOIN tbl_feature_user fu ON fu.feature_id = f.id AND fu.user_id = ?
                 WHERE f.status = 'live' AND (f.is_everyone = 1 OR fu.user_id IS NOT NULL)`,
                [userId]
            );
            return rows.map((row) => row.feature_key);
        } catch (error) {
            logReadFailure(error);
            return [];
        }
    }
}

module.exports = FeatureModel;
