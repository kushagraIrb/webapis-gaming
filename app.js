require('dotenv').config();
const express = require('express');
const path = require('path');
let cookieParser = require('cookie-parser'); 
/* Require cors (Cross Origin Resource Sharing) module for allowing resources (like fonts, images, APIs, etc.) on a web server to be requested by another domain (origin) different from the server's own domain */
const cors = require('cors');
/* Require to include the body-parser middleware, which is necessary to handle incoming request bodies */
const bodyParser = require('body-parser');
const { swaggerUi, swaggerDocs } = require('./config/swagger.js'); // Import the Swagger setup
const { logger, deleteOldLogs } = require('./logger.js'); // Import the Winston logger
var db = require('./config/database');
const setupRoutes = require('./config/routes');
const checkIPAccess = require('./helpers/checkIpAccess.js');

// Run cleanup every 24 hours
setInterval(() => {
    deleteOldLogs('errors');
    deleteOldLogs('info');
}, 86400000);

const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:true }));
app.use(cors());
app.use(cookieParser()); 

// Use the Swagger setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware to log all incoming requests
app.use((req, res, next) => {
    logger.info(`Request received: ${req.method} ${req.url}`);
    next();
});

// Global Error Handling Middleware (Prevents Crashes)
app.use((err, req, res, next) => {
    logger.error(`Error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ msg: 'An internal server error occurred' });
});

// Handle uncaught exceptions (Prevents Crashes)
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    // Do not exit the process
});

// Handle unhandled promise rejections (Prevents Crashes)
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection: ${reason}`);
});

app.use(checkIPAccess);
setupRoutes(app);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure Unhandled Route Errors Are Caught
app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    logger.error(error.message);
    next(error);
});

const port = process.env.SERVER_PORT || 3000;
const host = process.env.SERVER_HOST || 'localhost';

app.listen(port, function(){
    console.log(`App listening at http://${host}:${port}/`);
});