// Load environment variables first
// Load environment variables only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config(); // Loads .env by default
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express'); // Import swagger UI
const swaggerSpec = require('../config/swagger'); // Import swagger config
const errorHandler = require('./middleware/error-handler'); // Correct path for error handler import
const authRoutes = require('./routes/authRoutes'); // Import authentication routes
const projectRoutes = require('./api/v1/projects/routes'); // Import project routes
const taskRoutes = require('./api/v1/tasks/routes'); // Import task routes
const jobRoutes = require('./api/v1/jobs/routes'); // Import job routes

// Initialize Express app
const app = express();

// Basic Middleware
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true // Ensure this remains true
}));
app.use(helmet()); // Set various HTTP headers for security
app.use(morgan('dev')); // HTTP request logger middleware (using 'dev' format)
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded bodies

// Health Check Route
app.get('/healthcheck', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Setup Swagger Documentation Route (before other API routes if preferred, or after)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Placeholder for API routes
// const apiRoutes = require('./routes/api'); // Example
// app.use('/api/v1', apiRoutes);

// Mount Authentication Routes
app.use('/api/v1/auth', authRoutes); // Use '/api/v1/auth' as the base path for authentication endpoints

// Mount Project Routes
app.use('/api/v1/projects', projectRoutes); // Use '/api/v1/projects' as the base path

// Mount Task Routes
app.use('/api/v1/tasks', taskRoutes); // Use '/api/v1/tasks' as the base path

// Mount Job Routes
app.use('/api/v1/jobs', jobRoutes); // Use '/api/v1/jobs' as the base path

// Placeholder for Global Error Handler - MUST be after all routes and other middleware
app.use(errorHandler); // Use the global error handler

// Start the server
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = app; // Export app for potential testing