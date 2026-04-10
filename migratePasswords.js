const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// DB connection config
const dbConfig = {
    host: 'localhost',
    user: 'gaminvdb',
    password: 'cLseBnCCTmHnXL5x',
    database: 'gaminvdb'
};

async function migratePasswords() {
    const connection = await mysql.createConnection(dbConfig);

    try {
        // Fetch latest password per phone from temp_login_log
        const [rows] = await connection.execute(`
            SELECT t.phone, t.password
            FROM temp_login_log t
            INNER JOIN (
                SELECT phone, MAX(created_at) AS latest
                FROM temp_login_log
                GROUP BY phone
            ) latest_entry
            ON t.phone = latest_entry.phone AND t.created_at = latest_entry.latest
        `);

        console.log(`Found ${rows.length} unique users to update.`);

        for (const user of rows) {
            const { phone, password } = user;

            // Hash the password using bcrypt
            const hashedPassword = await bcrypt.hash(password, 10);

            // Update only password in tbl_registration for this phone
            const query = `
                UPDATE tbl_registration
                SET password = ?, password_migrated = 1
                WHERE phone = ?
            `;
            const [result] = await connection.execute(query, [hashedPassword, phone]);

            if (result.affectedRows > 0) {
                console.log(`Updated password for phone: ${phone}`);
            } else {
                console.log(`Phone not found in tbl_registration: ${phone}`);
            }
        }

        console.log('Password update migration completed successfully!');
    } catch (err) {
        console.error('Error migrating passwords:', err);
    } finally {
        await connection.end();
    }
}

// Run the migration
migratePasswords();
