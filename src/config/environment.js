const dotenv = require('dotenv');
const path = require('path');

// Determine the environment file path based on NODE_ENV
// For now, we'll rely on dotenv's default behavior which loads '.env'
// More sophisticated logic could be added here to load .env.staging, .env.production, etc.
// based on process.env.NODE_ENV if needed later.
const envPath = path.resolve(__dirname, '../../.env'); // Default to .env in the root

dotenv.config({ path: envPath });

// Log the environment being used (optional)
// console.log(`Loading environment variables from: ${envPath}`);
// console.log(`NODE_ENV set to: ${process.env.NODE_ENV}`);

// Export the loaded environment variables
module.exports = process.env;