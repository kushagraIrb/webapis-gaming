const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;
const mysql = require('mysql2');
const cluster = require('cluster');

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    timezone: 'Z'
});

if (cluster.isWorker) {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error(`[WORKER ${process.pid}] Error connecting to the database:`, err);
            process.exit(1); // Exit the worker on DB connection failure
        } else {
            console.log(`[WORKER ${process.pid}] ${DB_NAME} database connected successfully`);
            connection.release();
        }
    });
} else {
    console.log(`[MASTER ${process.pid}] Skipping DB connection in master process`);
}

module.exports = pool;