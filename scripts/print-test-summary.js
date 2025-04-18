// print-test-summary.js
const fs = require('fs');

// Check if the file exists before trying to read it
if (fs.existsSync('test-results.json')) {
  const results = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));

  console.log(`\nTest Results Summary:`);
  console.log(`- Total Test Suites: ${results.numTotalTestSuites}`);
  console.log(`- Total Tests: ${results.numTotalTests}`);
  console.log(`- Passed: ${results.numPassedTests}`);
  console.log(`- Failed: ${results.numFailedTests}`);
  console.log(`- Pending: ${results.numPendingTests}`);

  if (results.numFailedTests > 0) {
    console.log(`\nFailed Tests Summary:`);
    results.testResults.forEach(testResult => {
      if (testResult.numFailingTests > 0) {
        console.log(`- ${testResult.testFilePath}`);
        // Optionally list the failing test names, but keep it brief
        testResult.testResults
          .filter(test => test.status === 'failed')
          .forEach(test => {
            console.log(`  - ${test.title}`);
          });
      }
    });
  }

  // Clean up
  fs.unlinkSync('test-results.json');
} else {
  console.error('No test-results.json file found. Run tests with --json --outputFile=test-results.json first.');
}
