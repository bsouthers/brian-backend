// run-tests-quiet.js
const { spawnSync } = require('child_process');
const fs = require('fs');

console.log('Running tests quietly, suppressing setup logs...');

// Capture the original stdout and stderr for later
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

// Create a temporary output file
const outputFile = 'test-output.txt';
const outputStream = fs.createWriteStream(outputFile);

// Redirect stdout and stderr to our file
process.stdout.write = process.stderr.write = outputStream.write.bind(outputStream);

// Run the Jest tests
const result = spawnSync('node', [
  './node_modules/jest/bin/jest.js',
  '--runInBand',
  '--silent',
  '--noStackTrace',
  '--config=config/jest.summary.config.js'
], { 
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' } 
});

// Restore original stdout and stderr
process.stdout.write = originalStdout;
process.stderr.write = originalStderr;

// Close the output stream
outputStream.end();

// Read output file and filter out setup logs
const output = fs.readFileSync(outputFile, 'utf8');
const filteredOutput = output
  .split('\n')
  .filter(line => 
    !line.includes('Global Setup') && 
    !line.includes('migration') && 
    !line.includes('Seeded') &&
    !line.trim().startsWith('Running') &&
    !line.trim().startsWith('Reset') &&
    !line.trim().startsWith('{') &&
    !line.trim().startsWith('Added')
  )
  .join('\n');

// Display only the important parts (test results)
console.log('\n---- TEST RESULTS SUMMARY ----\n');
console.log(filteredOutput);

// Clean up
fs.unlinkSync(outputFile);

// Exit with the same code as Jest
process.exit(result.status);
