import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { env } from './config/env';
import { logger } from './logger';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Manutenção TPM API',
            version: '1.0.0',
            description: 'API documentation for the Manutenção TPM platform',
        },
        servers: [
            {
                url: `http://localhost:${env.server.port || 3000}`,
                description: 'Local server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error code',
                        },
                        message: {
                            type: 'string',
                            description: 'Human readable message',
                        },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/**/*.ts', './src/routes/**/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
    if (process.env.NODE_ENV !== 'production') {
        app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
        logger.info(`Swagger docs: http://localhost:${env.server.port || 3000}/api/docs`);
    }
};
