// ultra-compact-tests.js - Only shows pass/fail counts
const { spawn } = require('child_process');

console.log('Running tests with ultra-minimal output...');

// Run Jest tests
const jest = spawn('node', [
  './node_modules/jest/bin/jest.js',
  '--runInBand',
  '--silent',
  '--no-verbose'
], { 
  env: { ...process.env, NODE_ENV: 'test' }
});

// Variables to track test results
let passedTests = 0;
let failedTests = 0;
let totalTests = 0;
let testSuites = 0;
let failedSuites = 0;
let passedSuites = 0;
let timeElapsed = '';

// Process stdout and stderr, but don't display anything yet
jest.stdout.on('data', (data) => {
  const output = data.toString();
  
  // Extract test counts
  const testMatch = output.match(/Tests:\s+(\d+) passed,\s+(\d+) failed,\s+(\d+) total/);
  if (testMatch) {
    passedTests = parseInt(testMatch[1], 10);
    failedTests = parseInt(testMatch[2], 10);
    totalTests = parseInt(testMatch[3], 10);
  }
  
  // Extract test suite counts
  const suiteMatch = output.match(/Test Suites:\s+(\d+) failed,\s+(\d+) passed,\s+(\d+) total/);
  if (suiteMatch) {
    failedSuites = parseInt(suiteMatch[1], 10);
    passedSuites = parseInt(suiteMatch[2], 10);
    testSuites = parseInt(suiteMatch[3], 10);
  }
  
  // Extract time information
  const timeMatch = output.match(/Time:\s+([\d.]+\s+[a-z]+)/i);
  if (timeMatch) {
    timeElapsed = timeMatch[1];
  }
});

// Capture errors but don't display them
jest.stderr.on('data', () => {});

// When the process exits, show only the final summary
jest.on('close', (code) => {
  console.log('\n===== TEST SUMMARY =====');
  console.log(`Test Suites: ${failedSuites} failed, ${passedSuites} passed, ${testSuites} total`);
  console.log(`Tests:       ${failedTests} failed, ${passedTests} passed, ${totalTests} total`);
  console.log(`Time:        ${timeElapsed}`);
  console.log(`Result:      ${code === 0 ? 'PASSED' : 'FAILED'}`);
  
  // Exit with the same status code as Jest
  process.exit(code);
});
