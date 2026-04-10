const fs = require('fs');
const path = require('path');

const DAYS_21_IN_MS = 21 * 24 * 60 * 60 * 1000;

function deleteOldFiles(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        console.warn(`Directory not found: ${directoryPath}`);
        return;
    }

    const now = Date.now();

    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error(`Error reading directory ${directoryPath}`, err);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(directoryPath, file);

            fs.stat(filePath, (err, stats) => {
                if (err) return;

                // Skip directories
                if (!stats.isFile()) return;

                const fileAge = now - stats.mtimeMs;

                if (fileAge > DAYS_21_IN_MS) {
                    fs.unlink(filePath, err => {
                        if (err) {
                            console.error(`Failed to delete ${filePath}`, err);
                        } else {
                            console.log(`Deleted old file: ${filePath}`);
                        }
                    });
                }
            });
        });
    });
}

module.exports = deleteOldFiles;