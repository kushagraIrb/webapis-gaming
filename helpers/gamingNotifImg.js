const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
        const uploadPath = path.join(__dirname, '../uploads/notification');
        const ext = path.extname(file.originalname); // Get file extension
        const baseName = path.basename(file.originalname, ext); // Get file name without extension

        let newFilename = file.originalname;
        let counter = 1;

        // Check if file exists and modify name accordingly
        while (fs.existsSync(path.join(uploadPath, newFilename))) {
            newFilename = `${baseName}${counter}${ext}`;
            counter++;
        }

        cb(null, newFilename);
    },
});

// Multer upload instance for gaming notifications
const gamingNotificationUpload = multer({
    storage: storage,
});

module.exports = gamingNotificationUpload;