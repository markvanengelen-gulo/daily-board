# Daily Board Tests

This directory contains unit tests for the Daily Board application.

## Running Tests

The tests are written in vanilla JavaScript and can be run directly in the browser console.

### Option 1: Load and Run Tests in Browser

1. Open `index.html` in your web browser
2. Open the Developer Console (F12 or Cmd+Option+I)
3. Load the test file by running:
   ```javascript
   const script = document.createElement('script');
   script.src = 'tests/sync-providers.test.js';
   document.head.appendChild(script);
   ```
4. Once loaded, run the tests:
   ```javascript
   await runSyncProviderTests();
   ```

### Option 2: Include Tests in HTML (for development)

Add this to the bottom of `index.html` (before closing `</body>` tag):

```html
<!-- Test scripts (remove in production) -->
<script src="tests/sync-providers.test.js"></script>
<script>
    // Auto-run tests on page load (optional)
    window.addEventListener('load', async () => {
        console.log('Running automated tests...');
        await runSyncProviderTests();
    });
</script>
```

## Test Files

### `sync-providers.test.js`

Tests for the Google Drive Public Sync Provider and related functionality:

- **Google Drive Public Sync Provider Tests**: Tests the new public file sync provider
  - Provider initialization
  - File ID extraction from URLs
  - Cache management
  - Read-only behavior
  
- **Data Structure Validation Tests**: Validates the data structure
  - Required fields (dateEntries, tabs, listItems)
  - Data type validation
  - Structure integrity

- **Error Handling Tests**: Tests error scenarios
  - Missing file ID
  - Network errors
  - Invalid data structures
  
- **Integration Tests**: Tests integration with main app
  - Sync mode detection
  - Provider initialization
  - UI configuration

## Running Individual Test Suites

You can run specific test suites:

```javascript
// Run only Google Drive Public Provider tests
await runGoogleDrivePublicProviderTests();

// Run only data validation tests
await runDataValidationTests();

// Run only error handling tests
await runErrorHandlingTests();

// Run only integration tests
await runIntegrationTests();
```

## Test Results

Test results are displayed in the browser console with:
- ✓ for passed tests
- ✗ for failed tests
- Summary with total passed/failed counts
- Details of any errors

## Adding New Tests

To add new tests to an existing suite:

```javascript
suite.test('Test description', async () => {
    // Test code here
    assertTrue(condition, 'Error message');
});
```

Available assertion helpers:
- `assertEquals(actual, expected, message)`
- `assertTrue(value, message)`
- `assertFalse(value, message)`
- `assertThrows(fn, message)`
- `assertRejects(fn, message)` - for async functions

## Notes

- Tests use a minimal test framework to avoid external dependencies
- Tests are designed to work in modern browsers with ES6+ support
- For more comprehensive testing, consider integrating Jest or Mocha in the future
- These tests focus on unit testing and basic integration testing
- Network tests may require mocking fetch API for consistent results
