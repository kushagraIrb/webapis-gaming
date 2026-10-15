const db = require('../config/database');
const { logger } = require('../logger');

let warnedMissingTable = false;

class OcrSettingModel {
    // The OCR engine chosen in the admin panel (Admin Area -> OCR Engine), or null
    // when none is stored - the caller then uses the default engine (python).
    //
    // The table is created and seeded by migrations/20261013-ocr-engine-setting.sql in the admin
    // panel's Node repo. Until that has run on this database the default is used, so screenshot
    // reading keeps working. Any other database error is thrown.
    static async getEngine() {
        try {
            const [rows] = await db.promise().query('SELECT engine FROM tbl_ocr_setting WHERE id = 1');
            // An empty value (what a non-strict MySQL stores for an invalid ENUM) counts as "none stored"
            return rows.length > 0 && rows[0].engine ? rows[0].engine : null;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') {
                if (!warnedMissingTable) {
                    warnedMissingTable = true;
                    logger.warn('tbl_ocr_setting does not exist yet - the admin panel OCR switch is ignored and the default engine (python) is used');
                }
                return null;
            }
            throw error;
        }
    }
}

module.exports = OcrSettingModel;
