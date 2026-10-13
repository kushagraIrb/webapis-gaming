const multer = require('multer');

// Upload for OCR only: the screenshot is kept in memory and passed to the OCR engine.
// Nothing is written to disk here - the file is stored later, by deposit save.
const MAX_SIZE_MB = 10;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_MB * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
        }
    },
});

// Express middleware: reads the "image" field and answers upload problems with a clear 4xx
// (instead of the generic 500 that multer errors would otherwise end up as).
module.exports = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (!err) return next();

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).send({ status: false, message: `Screenshot is too large. Maximum size is ${MAX_SIZE_MB} MB.` });
        }
        if (err instanceof multer.MulterError) {
            return res.status(400).send({ status: false, message: 'Please upload the screenshot as an image file.' });
        }
        return next(err);
    });
};
