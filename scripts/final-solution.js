// final-solution.js - Ultimate simplification: just run a single test file with minimal output
const { spawn } = require('child_process');

// Run Jest with a single file or pattern to drastically reduce output
const testPath = process.argv[2] || 'tests/unit'; // Default to unit tests if no path provided
console.log(`Running tests with minimal output from: ${testPath}`);

// Run Jest tests with only one small test file
const jest = spawn('node', [
  './node_modules/jest/bin/jest.js',
  testPath,
  '--silent',
  '--no-verbose',
  '--no-color'
], { 
  env: { ...process.env, NODE_ENV: 'test' } 
});

// Collect all output
let allOutput = '';

// Process and filter output
jest.stdout.on('data', (data) => {
  const output = data.toString();
  
  // Only capture test summary information
  if (output.includes('Test Suites:') || 
      output.includes('Tests:') || 
      output.includes('Snapshots:') || 
      output.includes('Time:')) {
    allOutput += output;
  }
});

// Handle process completion
jest.on('close', (code) => {
  // Print only summary information
  console.log('\n===== TEST SUMMARY =====');
  if (allOutput) {
    console.log(allOutput);
  } else {
    console.log('No summary information found');
  }
  console.log(`Result: ${code === 0 ? 'PASSED ✓' : 'FAILED ✗'}`);
  
  // Exit with the same status code as Jest
  process.exit(code);
});

// Handle errors silently (we only care about the exit code)
jest.stderr.on('data', () => {});
