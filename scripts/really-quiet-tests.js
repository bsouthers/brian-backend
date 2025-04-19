// really-quiet-tests.js
const { spawn } = require('child_process');
const readline = require('readline');

console.log('Running tests with minimal output...');

// Run Jest tests
const jest = spawn('node', [
  './node_modules/jest/bin/jest.js',
  '--runInBand',
  '--silent',
  '--noStackTrace',
  '--no-verbose'
], { 
  env: { ...process.env, NODE_ENV: 'test' }
});

// Collect test results
let summary = '';
let collectingSummary = false;
let passedCount = 0;
let failedCount = 0;
let totalCount = 0;
let testResults = [];

// Create readline interface to process output line by line
const rl = readline.createInterface({
  input: jest.stdout,
  output: process.stdout,
  terminal: false
});

// Process output line by line
rl.on('line', (line) => {
  // Skip setup logs, migration logs, etc.
  if (line.includes('Global Setup') || 
      line.includes('migration') ||
      line.includes('Seeded') ||
      line.includes('Reset ') ||
      line.startsWith('{') ||
      line.startsWith('[') ||
      line.includes('WARN') ||
      line.includes('INFO') ||
      line.includes('DEBUG') ||
      line.includes('ERROR') ||
      line.includes('Added column')) {
    return;
  }

  // Start collecting summary when we see the test summary
  if (line.includes('Test Suites:') || line.includes('Tests:') || line.includes('Snapshots:') || line.includes('Time:')) {
    collectingSummary = true;
  }

  // Collect test summary lines
  if (collectingSummary) {
    summary += line + '\n';
    
    // Extract test counts
    if (line.includes('Tests:')) {
      const match = line.match(/(\d+) passed, (\d+) failed, (\d+) total/);
      if (match) {
        passedCount = parseInt(match[1], 10);
        failedCount = parseInt(match[2], 10);
        totalCount = parseInt(match[3], 10);
      }
    }
  }
  
  // Collect individual test failures
  if (line.includes('● ') && !line.includes('Test Suites:') && !line.includes('Tests:')) {
    testResults.push(line);
  }
});

// Handle error output
jest.stderr.on('data', (data) => {
  const stderr = data.toString();
  // Filter out setup and migration logs
  if (!stderr.includes('Global Setup') && 
      !stderr.includes('migration') &&
      !stderr.includes('Seeded') &&
      !stderr.includes('Reset ') &&
      !stderr.includes('INFO') &&
      !stderr.includes('DEBUG') &&
      !stderr.includes('WARN') &&
      !stderr.startsWith('{')) {
    process.stderr.write(data);
  }
});

// When the test run is complete
jest.on('close', (code) => {
  console.log('\n----- TEST SUMMARY -----');
  if (summary) {
    console.log(summary);
  } else {
    console.log(`Tests completed with code ${code}`);
    console.log(`Passed: ${passedCount}, Failed: ${failedCount}, Total: ${totalCount}`);
  }
  
  // Print only failed test names
  if (testResults.length > 0) {
    console.log('\nFailed Tests:');
    testResults.forEach(result => console.log(result));
  }
  
  process.exit(code);
});
