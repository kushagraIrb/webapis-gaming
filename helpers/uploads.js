const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsRoot = path.resolve(__dirname, '../uploads');

const normalizeFolder = (folder) => {
    const normalized = String(folder || '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/^uploads\//i, '');

    if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
        return 'common';
    }

    return normalized;
};

const createStorage = (fixedFolder) => multer.diskStorage({
    destination: function (req, file, cb) {
        const subFolder = normalizeFolder(fixedFolder || (req.body && req.body.subFolder) || 'common');
        const uploadPath = path.join(uploadsRoot, subFolder);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
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

const createUpload = (fixedFolder) => multer({
    storage: createStorage(fixedFolder),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: fileFilter,
});

const upload = createUpload();

// Resolve only paths that exist under uploads; this supports legacy records.
const resolveStoredUploadPath = (storedValue, preferredFolders = []) => {
    if (!storedValue || typeof storedValue !== 'string') return null;

    let relative = storedValue.trim().replace(/\\/g, '/');
    try {
        for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(relative); i++) {
            relative = decodeURIComponent(relative);
        }
    } catch (_) {
        return null;
    }
    relative = relative.replace(/^\/+/, '').replace(/^uploads\//i, '');

    if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
    if (/%2f|%5c/i.test(relative)) return null;
    if (relative.split('/').slice(0, -1).some(part => part.toLowerCase() === 'withdrawl')) return null;

    const candidates = relative.includes('/')
        ? [relative]
        : preferredFolders.map(folder => `${normalizeFolder(folder)}/${relative}`);

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(uploadsRoot, candidate))) return candidate;
    }

    if (relative.includes('/')) return null;

    const findMatch = (directory, prefix = '') => {
        if (!fs.existsSync(directory)) return null;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryRelative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isFile() && entry.name === relative) return entryRelative;
            if (entry.isDirectory()) {
                const match = findMatch(path.join(directory, entry.name), entryRelative);
                if (match) return match;
            }
        }
        return null;
    };

    return findMatch(uploadsRoot);
};

upload.forSubFolder = (folder) => createUpload(folder);
upload.resolveStoredUploadPath = resolveStoredUploadPath;

module.exports = upload;
