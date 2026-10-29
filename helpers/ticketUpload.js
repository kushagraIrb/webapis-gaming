const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload for the ticket attachment (new ticket). Kept apart from helpers/uploads so that the
// deposit and profile uploads stay images-only.
//   images: JPG / PNG up to 2 MB (as before)
//   videos: MP4 / MOV / 3GP up to 7 MB
// .webm is not accepted on purpose: the ticket pages treat a .webm attachment as an audio message.
const MB = 1024 * 1024;
const MAX_IMAGE_MB = 2;
const MAX_VIDEO_MB = 7;

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const VIDEO_EXTENSIONS = {
    'video/mp4': ['.mp4', '.m4v'],
    'video/quicktime': ['.mov'],
    'video/3gpp': ['.3gp'],
};

const UNSUPPORTED_MESSAGE = 'Please upload a JPG or PNG image, or an MP4, MOV or 3GP video.';
const TOO_LARGE_MESSAGE = `File is too large. Images can be up to ${MAX_IMAGE_MB} MB and videos up to ${MAX_VIDEO_MB} MB.`;

const DEFAULT_DIR = path.join(__dirname, '../uploads/tickets');

const isAllowed = (file) => {
    if (IMAGE_TYPES.includes(file.mimetype)) return true;
    const extensions = VIDEO_EXTENSIONS[file.mimetype];
    // a video must also carry a matching extension, so nothing like "x.html" is stored under a video type
    return !!extensions && extensions.includes(path.extname(file.originalname).toLowerCase());
};

function makeTicketUpload({ dir = DEFAULT_DIR } = {}) {
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
        },
        filename: function (req, file, cb) {
            const ext = path.extname(file.originalname).toLowerCase();
            const baseName = path.basename(file.originalname, path.extname(file.originalname))
                .replace(/[^A-Za-z0-9._-]+/g, '_')
                .slice(0, 80);

            cb(null, `${baseName}_${Date.now()}${ext}`);
        },
    });

    const upload = multer({
        storage,
        // multer treats a file that reaches fileSize exactly as too large, so allow one byte more
        // to make the 7 MB cap inclusive
        limits: { fileSize: MAX_VIDEO_MB * MB + 1, files: 1 },
        fileFilter: (req, file, cb) => {
            if (isAllowed(file)) return cb(null, true);
            cb(Object.assign(new Error(UNSUPPORTED_MESSAGE), { code: 'UNSUPPORTED_FILE' }));
        },
    });

    // Express middleware for one file field: answers upload problems with a clear 4xx
    // (the generic handler would turn them into a 500) and applies the smaller limit to images.
    return (fieldName) => (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ status: false, message: TOO_LARGE_MESSAGE });
                }
                if (err.code === 'UNSUPPORTED_FILE' || err instanceof multer.MulterError) {
                    return res.status(400).json({ status: false, message: UNSUPPORTED_MESSAGE });
                }
                return next(err);
            }

            if (req.file && req.file.mimetype.startsWith('image/') && req.file.size > MAX_IMAGE_MB * MB) {
                fs.unlink(req.file.path, () => {});
                return res.status(413).json({ status: false, message: TOO_LARGE_MESSAGE });
            }

            next();
        });
    };
}

module.exports = makeTicketUpload();
module.exports.makeTicketUpload = makeTicketUpload;
