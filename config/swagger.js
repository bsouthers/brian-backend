// C:\Apps\Brian\config\swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0', // Specify OpenAPI version
    info: {
      title: 'Brian Project API', // API Title
      version: '1.0.0', // API version
      description: 'API documentation for the Brian project, managing projects, tasks, and jobs.',
      // Optional: Add contact, license info
      // contact: {
      //   name: 'API Support',
      //   url: 'http://www.example.com/support',
      //   email: 'support@example.com',
      // },
      // license: {
      //   name: 'Apache 2.0',
      //   url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      // },
    },
    servers: [
      {
        url: '/api/v1', // Base path for API V1 routes
        description: 'Development server V1',
      },
      // Add other servers if needed (e.g., production)
      // {
      //   url: 'https://api.example.com/v1',
      //   description: 'Production server V1',
      // }
    ],
    // Optional: Define components like security schemes (e.g., Bearer Auth)
    components: {
      securitySchemes: {
        bearerAuth: { // Arbitrary name for the scheme
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT', // Optional, specifies format
          description: 'Enter JWT Bearer token **_only_**'
        }
      }
    },
    security: [ // Apply security globally (can be overridden per operation)
      {
        bearerAuth: [] // References the scheme defined above
      }
    ]
  },
  // Path to the API docs files (route files with JSDoc annotations)
  // Use absolute paths to ensure consistency
  apis: [
    'C:/Apps/Brian/src/api/v1/projects/routes.js',
    'C:/Apps/Brian/src/api/v1/tasks/routes.js',
    'C:/Apps/Brian/src/api/v1/jobs/routes.js',
    // Add other route files here if they contain API endpoints
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;