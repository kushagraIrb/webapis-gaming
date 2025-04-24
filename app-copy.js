require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const cluster = require('cluster');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { swaggerUi, swaggerDocs } = require('./config/swagger.js');
const { logger, deleteOldLogs } = require('./logger.js');
const setupRoutes = require('./config/routes');
const checkIPAccess = require('./helpers/checkIpAccess.js');

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    // Clean up logs every 24 hours (only in master)
    setInterval(() => {
        deleteOldLogs('errors');
        deleteOldLogs('info');
    }, 86400000);

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // If a worker dies, log and fork a new one
    cluster.on('exit', (worker, code, signal) => {
        console.error(`Worker ${worker.process.pid} died. Forking a new one.`);
        cluster.fork();
    });

} else {
    const app = express();

    app.use(express.json());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cors());
    app.use(cookieParser());

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

    // Log incoming requests
    app.use((req, res, next) => {
        logger.info(`Request received: ${req.method} ${req.url}`);
        next();
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        logger.error(`Error: ${err.message}`, { stack: err.stack });
        res.status(500).json({ msg: 'An internal server error occurred' });
    });

    process.on('uncaughtException', (err) => {
        logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error(`Unhandled Rejection: ${reason}`);
    });

    app.use(checkIPAccess);
    setupRoutes(app);

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    app.use((req, res, next) => {
        const error = new Error(`Not Found - ${req.originalUrl}`);
        res.status(404);
        logger.error(error.message);
        next(error);
    });

    const port = process.env.SERVER_PORT || 3000;
    const host = process.env.SERVER_HOST || 'localhost';

    app.listen(port, () => {
        console.log(`Worker ${process.pid} listening at http://${host}:${port}/`);
    });
}