const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

// Configure multer storage for gaming notifications
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../uploads/notification');

        // Create the folder if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath); // Set destination folder
    },
    filename: function (req, file, cb) {
        // Server-chosen name: the client's file name and extension are never used.
        const ext = ALLOWED_TYPES[file.mimetype];
        cb(null, `notif_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
});

// Multer upload instance for gaming notifications
const gamingNotificationUpload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
        cb(new Error('Invalid file type. Only JPEG, PNG, WEBP and GIF images are allowed.'));
    },
});

module.exports = gamingNotificationUpload;