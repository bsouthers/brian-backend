// jest.summary.config.js
const baseConfig = require('../jest.config.js');
const path = require('path');

module.exports = {
  ...baseConfig,
  // Set rootDir to point to the project root
  rootDir: path.resolve(__dirname, '..'),
  // Only output failures
  verbose: false,
  // Configure the summary reporter with a high threshold
  reporters: [
    ["summary", {
      "summaryThreshold": 1000 // Very high threshold to minimize detailed output
    }]
  ],
  // Disable coverage reporting in the summary
  collectCoverage: false
};
