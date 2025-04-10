const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Number of simultaneous connections
    queueLimit: 0, // No limit on the number of requests queued
    timezone: 'Z'
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        process.exit(1); // Exit the application on a critical error
    } else {
        console.log(`${DB_NAME} database connected successfully`);
        connection.release(); // Release the connection back to the pool
    }
});

module.exports = pool;