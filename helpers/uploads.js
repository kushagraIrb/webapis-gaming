const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_FOLDERS = ['common', 'tickets', 'ticket', 'profile', 'deposit', 'deposit_log'];
const EXT_BY_TYPE = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png' };

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // The folder comes from a fixed allow-list: a value from the request that is not on it
        // (for example one containing ../) falls back to 'common'.
        const requested = String(req.body.subFolder || 'common');
        const subFolder = ALLOWED_FOLDERS.includes(requested) ? requested : 'common';
        const uploadPath = path.join(__dirname, '../uploads', subFolder);

        // console.log('Upload path:', uploadPath);

        // Create the folder if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath); // Directory to save uploaded files
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        // Extension comes from the (filtered) content type, never from the client's file name.
        const ext = EXT_BY_TYPE[file.mimetype] || '.jpg';
        const baseName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'file';

        // console.log('Generated filename:', `${baseName}_${timestamp}${ext}`);

        cb(null, `${baseName}_${timestamp}${ext}`); // Unique filename
    },
});

// File filter for specific file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, JPG, and PNG are allowed.'));
    }
};

// Multer upload instance
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: fileFilter,
});

module.exports = upload;