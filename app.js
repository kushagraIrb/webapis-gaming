require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const cluster = require('cluster');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bodyParser = require('body-parser');
const { swaggerUi, swaggerDocs } = require('./config/swagger.js');
const { logger, deleteOldLogs } = require('./logger.js');
const db = require('./config/database.js');
const setupRoutes = require('./config/routes.js');
const { checkIPAccess, checkIPAccessStatus } = require('./helpers/checkIpAccess.js');

const whitelist = ['/api/contact-us', '/api/home-slider'];

const numCPUs = os.cpus().length;
const port = process.env.SERVER_PORT || 3000;
const host = process.env.SERVER_HOST || 'localhost';

if (cluster.isMaster) {
    console.log(`[MASTER ${process.pid}] Starting master process`);

    // Run the coin flip cron job only in the master process
    require('./helpers/coinFlipCron.js');

    // Run log cleanup every 24 hours
    setInterval(() => {
        deleteOldLogs('errors');
        deleteOldLogs('info');
    }, 86400000);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Restart dead workers
    cluster.on('exit', (worker, code, signal) => {
        logger.error(`Worker ${worker.process.pid} died. Starting a new one...`);
        cluster.fork();
    });

} else {
    const app = express();

    // Middleware setup
    app.use(express.json());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cors());
    app.use(cookieParser());

    // Swagger API docs
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

    // Request logger
    app.use((req, res, next) => {
        logger.info(`Request received: ${req.method} ${req.url}`);
        next();
    });

    // IP access middleware and routes
    app.use((req, res, next) => {
        // Skip IP check for whitelisted routes
        if (whitelist.some(path => req.path.startsWith(path))) {
            return next();
        }
        return checkIPAccess(req, res, next);
    });

    setupRoutes(app);

    // IP access check endpoint
    app.get('/api/check-ip', checkIPAccessStatus);

    // Static uploads
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // Handle 404s
    app.use((req, res, next) => {
        const error = new Error(`Not Found - ${req.originalUrl}`);
        res.status(404);
        logger.error(error.message);
        next(error);
    });

    // Global error handler
    app.use((err, req, res, next) => {
        logger.error(`Error: ${err.message}`, { stack: err.stack });
        res.status(500).json({ msg: 'An internal server error occurred' });
    });

    // Uncaught exception handler
    process.on('uncaughtException', (err) => {
        logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
        logger.error(`Unhandled Rejection: ${reason}`);
    });

    // Start server
    app.listen(port, () => {
        console.log(`[WORKER ${process.pid}] App listening at http://${host}:${port}/`);
    });
}