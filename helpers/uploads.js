const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const subFolder = req.body.subFolder || 'common'; // Use the dynamic subFolder or default to 'common'
        const uploadPath = path.join(__dirname, `../uploads/${subFolder}`);

        // console.log('Upload path:', uploadPath);

        // Create the folder if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath); // Directory to save uploaded files
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);

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