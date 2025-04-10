const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require("dotenv").config();

// Swagger options
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Gaming Rewamp APIs",
            description: "You can see APIs for GamingRewamp",
        },
        servers: [
            {
                url: process.env.SERVER_URL || `http://localhost:${process.env.SERVER_PORT || 3000}`,
                description: process.env.NODE_ENV === 'production' ? "Production Server" : "Local Development Server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT", // Optional, but helps to indicate that it's a JWT token
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ], // Apply the security scheme globally
    },
    apis: ["./routes/*.js", "./swagger/*.js"], // Specify the path to your route files for Swagger documentation
};

// Initialize swagger-jsdoc
const swaggerDocs = swaggerJSDoc(swaggerOptions);

module.exports = { swaggerUi, swaggerDocs };
