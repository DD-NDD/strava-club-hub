/**
 * @fileoverview A collection of test functions to validate the application's core services.
 * Run these from the Apps Script editor to ensure everything is working as expected.
 */

// =================================================================
// TEST RUNNER & HELPERS
// =================================================================

/**
 * A simple assertion function for testing in the Apps Script environment.
 * @param {boolean} condition The condition to test.
 * @param {string} message The message to display if the assertion fails.
 */
function assert(condition, message) {
  if (!condition) {
    const errorMessage = 'Assertion Failed: ' + (message || '');
    debugLog(errorMessage, 'ERROR');
    throw new Error(errorMessage);
  }
}

/**
 * Clears all known application caches to ensure a clean state for testing.
 */
function _clearAllCachesForTesting() {
  debugLog('--- Clearing all application caches for testing ---', 'INFO');
  const allCacheKeys = Object.values(CACHE_KEYS);
  AppCache.removeAll(allCacheKeys);
  debugLog('All caches cleared.', 'INFO');
}


/**
 * Main test runner function. Executes all test suites.
 */
function runAllTests() {
  _clearAllCachesForTesting(); // Ensure a clean state before starting
  debugLog('====== STARTING ALL TESTS ======', 'INFO');
  const testUserId = 999999999; // Use a consistent ID for all tests

  try {
    // Run tests in a logical order
    testSheetService();
    testDatabaseWriteOperations(testUserId);
    testGetSingleUserData(testUserId);
    testGetAllUsersData(testUserId);
    debugLog('====== ALL TESTS PASSED SUCCESSFULLY ======', 'INFO');
  } catch (e) {
    debugLog(`====== A TEST FAILED: ${e.message} ======`, 'ERROR');
  } finally {
    // Cleanup the test user after all tests are run
    _cleanupTestUser(testUserId);
  }
}

/**
 * Private helper to remove a test user from the database sheet.
 * @param {number} testUserId The ID of the user to remove.
 */
function _cleanupTestUser(testUserId) {
  try {
    const dbSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DATABASE);
    const dbData = dbSheet.getDataRange().getValues();
    const rowIndex = dbData.findIndex(row => row[DB_COLUMNS.ID - 1] == testUserId);
    
    if (rowIndex > -1) {
      dbSheet.deleteRow(rowIndex + 1);
      AppCache.remove(CACHE_KEYS.ALL_MEMBERS); // Clear cache to reflect deletion
      debugLog(`Cleaned up test user ID: ${testUserId}`, 'INFO');
    }
  } catch (e) {
    debugLog(`Could not clean up test user ID ${testUserId}: ${e.message}`, 'WARNING');
  }
}


// =================================================================
// AUTOMATED TEST SUITES
// =================================================================

/**
 * Test suite for SheetService.
 */
function testSheetService() {
  debugLog('--- Running SheetService Tests ---', 'INFO');
  const testSheetName = 'TestSheet_Temp';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const oldSheet = ss.getSheetByName(testSheetName);
  if (oldSheet) ss.deleteSheet(oldSheet);

  try {
    const testSheet = ss.insertSheet(testSheetName);
    testSheet.appendRow(['ID', 'Name', 'Value']);

    let data = SheetService.getDataAsObjects(testSheetName);
    assert(Array.isArray(data) && data.length === 0, 'getDataAsObjects should return an empty array for a sheet with only headers.');
    debugLog('Test Passed: getDataAsObjects (empty)', 'INFO');

    const testObj1 = { ID: 1, Name: 'Test A', Value: 100 };
    SheetService.appendObjects(testSheetName, [testObj1]);
    data = SheetService.getDataAsObjects(testSheetName);
    assert(data.length === 1 && data[0].Name === 'Test A', 'appendObjects failed.');
    debugLog('Test Passed: appendObjects', 'INFO');

    const updateObj = { Name: 'Test A Updated', Value: 150 };
    SheetService.updateObjectById(testSheetName, 1, updateObj, 'ID');
    data = SheetService.getDataAsObjects(testSheetName);
    assert(data.length === 1 && data[0].Name === 'Test A Updated' && data[0].Value == 150, 'updateObjectById failed.');
    debugLog('Test Passed: updateObjectById', 'INFO');

  } finally {
    const sheetToDelete = ss.getSheetByName(testSheetName);
    if (sheetToDelete) {
      ss.deleteSheet(sheetToDelete);
      debugLog('--- Cleaned up test sheet ---', 'INFO');
    }
  }
}

/**
 * Tests the create/update and encoding logic of the DatabaseService.
 * @param {number} testUserId The ID for the test user.
 */
function testDatabaseWriteOperations(testUserId) {
  debugLog('--- Running Database Write & Encoding Tests ---', 'INFO');
  const dbSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DATABASE);
  const testUserData = {
      id: testUserId,
      firstname: 'Test',
      lastname: 'User',
      accessToken: 'test-token-' + new Date().getTime()
  };

  const createResult = DatabaseService.updateUserData(testUserId, testUserData);
  assert(createResult === true, 'updateUserData (create) should return true.');
  debugLog('Test Passed: updateUserData (create)', 'INFO');
  
  const updatedData = dbSheet.getDataRange().getValues();
  const newRowIndex = updatedData.findIndex(row => row[DB_COLUMNS.ID - 1] == testUserId);
  assert(newRowIndex > -1, 'Test user row was not found in the sheet after creation.');
  const rawEncodedData = updatedData[newRowIndex][DB_COLUMNS.USER_DATA - 1];
  
  const plainJsonWithoutId = `{"firstname":"Test","lastname":"User","accessToken":"${testUserData.accessToken}"}`;
  assert(rawEncodedData.length > 0, 'USER_DATA should not be empty.');
  assert(rawEncodedData.indexOf('accessToken') === -1, 'USER_DATA should be encoded and not contain plain text keys.');
  assert(decodeData(rawEncodedData) === plainJsonWithoutId, 'decodeData should correctly reverse the encoded string.');
  debugLog('Test Passed: Data is correctly encoded in the sheet.', 'INFO');
}

/**
 * Tests retrieving a single user's data. Assumes the user exists.
 * @param {number} testUserId The ID of the user to fetch.
 */
function testGetSingleUserData(testUserId = "63781571") {
  debugLog('--- Running Get Single User Data Test ---', 'INFO');
  
  const user = DatabaseService.getUserData(testUserId);

  Logger.log('Full user data from testGetSingleUserData:');
  Logger.log(JSON.stringify(user, null, 2));
  
  assert(user, 'getUserData should return a user object for an existing user.');
  assert(user.id == testUserId, `Fetched user ID ${user.id} does not match expected ID ${testUserId}.`);
  assert(user.name === 'Test User', 'User name is incorrect.');
  assert(user.accessToken.startsWith('test-token'), 'User access token is incorrect.');
  
  debugLog('Test Passed: getUserData correctly decodes and returns a single user object.', 'INFO');
}

/**
 * Tests retrieving all users. Assumes at least one test user exists.
 * @param {number} testUserId The ID of the user to check for.
 */
function testGetAllUsersData(testUserId) {
  debugLog('--- Running Get All Users Data Test ---', 'INFO');

  const allUsers = DatabaseService.getAllUsers();
  
  assert(Array.isArray(allUsers) && allUsers.length > 0, 'getAllUsers should return a non-empty array.');
  
  const foundUser = allUsers.some(u => u.id == testUserId);
  assert(foundUser, `getAllUsers result should contain the test user ID ${testUserId}.`);
  
  debugLog('Test Passed: getAllUsers includes the test user.', 'INFO');
}

// =================================================================
// MANUAL & DEBUGGING FUNCTIONS
// =================================================================

/**
 * Helper function to log the response from a single API call.
 * @param {string} apiName The name of the API being tested.
 * @param {string} responseString The JSON string response from the API.
 */
function _logSingleApiResponse(apiName, responseString) {
  try {
    debugLog(`--- Testing API: ${apiName} ---`);
    const result = JSON.parse(responseString);
    if (result.success) {
      Logger.log(`✅ SUCCESS: ${apiName}`);
      Logger.log(`Source: ${result.source || 'N/A'}`);
      Logger.log(`Data Count: ${result.data ? result.data.length : 'N/A'}`);
      Logger.log(`Sample Data: ${JSON.stringify(result.data ? result.data.slice(0, 2) : 'No data', null, 2)}`);
    } else {
      Logger.log(`❌ FAILED: ${apiName}`);
      Logger.log(`Error: ${result.error}`);
    }
  } catch (e) {
    Logger.log(`❌ CRITICAL FAIL: ${apiName} - Could not parse JSON response.`);
    Logger.log(`Raw Response: ${responseString}`);
  }
}

// --- Individual Manual API Test Functions ---

function manualTest_API_getAllMembersData() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getAllMembersData', getAllMembersData());
}

function manualTest_API_getLeaderboardData() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getLeaderboardData (This Month)', getLeaderboardData('this_month'));
}

function manualTest_API_getTopThreeThisMonth() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getTopThreeThisMonth', getTopThreeThisMonth());
}

function manualTest_API_getRecentActivities() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getRecentActivities', getRecentActivities());
}

function manualTest_API_getAllPools() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getAllPools', getAllPools());
}

function manualTest_API_getAllPosts() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getAllPosts', getAllPosts());
}

function manualTest_API_getActiveEvents() {
  _clearAllCachesForTesting();
  _logSingleApiResponse('getActiveEvents', getActiveEvents());
}

/**
 * A manual test function to fetch and display all data for a specific user.
 * It will prompt you to enter a user ID.
 */
function manualTest_GetAndLogUserData() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Check User Data',
    'Please enter the Strava User ID:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() == ui.Button.OK) {
    const userId = response.getResponseText().trim();
    if (!userId) {
      ui.alert('User ID cannot be empty.');
      return;
    }
    
    _clearAllCachesForTesting();
    debugLog(`--- Starting Manual Check for User ID: ${userId} ---`, 'INFO');
    
    const user = DatabaseService.getUserData(userId);
    
    if (user) {
      const formattedUserData = JSON.stringify(user, null, 2); // Pretty print JSON
      Logger.log(`FOUND DATA FOR USER ID: ${userId}\n${formattedUserData}`);
    } else {
      Logger.log(`NO DATA FOUND FOR USER ID: ${userId}`);
      ui.alert(`User not found with ID: ${userId}`);
    }
    
    debugLog(`--- Finished Manual Check for User ID: ${userId} ---`, 'INFO');
  }
}

// Add this to your Tests.js file for easy execution

/**
 * A manual function to clean the Activities sheet of any non-swim entries.
 * Can be run directly from the Apps Script editor.
 */
function manualCleanNonSwimActivities() {
    debugLog('--- Starting manual cleanup of non-swim activities ---', 'INFO');
    const result = SheetService.removeNonSwimActivities();
    if (result.success) {
      ui.alert(`Cleanup successful. Removed ${result.removedCount} activities.`);
      debugLog(`--- Cleanup successful. Removed ${result.removedCount} activities. ---`, 'INFO');
    } else {
      debugLog(`--- Cleanup failed: ${result.error} ---`, 'ERROR');
    }

}

/**
 * A manual test function to trigger the activity sync process for a single, specific user.
 * Edit the 'testUserId' variable to target a different user for testing.
 * This function does not use any UI and should be run from the Apps Script editor.
 */
function manualTest_SyncUserActivities() {
  // --- DEFINE USER ID FOR TESTING HERE ---
  // Replace 'YOUR_USER_ID_HERE' with a valid Strava User ID that exists in your Database sheet.
  const testUserId = '63781571';
  const forceTheSync = true;

  // Basic check to ensure the developer has changed the user ID.
  if (testUserId === 'YOUR_USER_ID_HERE' || !testUserId) {
    const errorMessage = 'Please edit the manualTest_SyncUserActivities function in Tests.js to provide a valid User ID.';
    debugLog(errorMessage, 'ERROR');
    // Also log to the default logger so it's immediately visible.
    Logger.log(errorMessage); 
    return;
  }

  debugLog(`--- Starting MANUAL activity sync for User ID: ${testUserId} ---`, 'INFO');

  try {
    _clearAllCachesForTesting();

    // Directly call the core sync function located in Triggers.js
    const activitiesWereAdded = syncActivitiesForUser(testUserId, forceTheSync);

    if (activitiesWereAdded) {
      debugLog(`Manual sync complete. New activities were successfully added for user ${testUserId}.`, 'INFO');
      
      // It's important to invalidate the cache after adding new activities.
      // This ensures the web app will show the new data immediately upon refresh.
      AppCache.invalidateActivityCaches();
      debugLog('Activity caches have been invalidated to reflect the changes.', 'INFO');
    } else {
      debugLog(`Manual sync complete. No new activities were found or added for user ${testUserId}. The user might be up-to-date.`, 'INFO');
    }

  } catch (e) {
    debugLog(`An error occurred during the manual sync for user ${testUserId}: ${e.message}`, 'ERROR');
  }

  debugLog(`--- Finished MANUAL sync for User ID: ${testUserId} ---`, 'INFO');
}

/**
 * A one-time manual function to migrate all date formats in the 'Activities' sheet.
 * It finds cells that are Date objects and converts them to a standard ISO 8601 UTC string.
 * WARNING: This version has no UI confirmation and will modify data immediately upon running.
 */
function manualTest_MigrateDateFormatsToISO_NoUI() {
  debugLog('--- Starting Date Format Migration for Activities Sheet (No UI) ---', 'INFO');
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACTIVITIES);
    const range = sheet.getDataRange();
    const values = range.getValues();
    const headers = values[0];
    
    const dateColumnIndex = headers.indexOf('start_date');
    if (dateColumnIndex === -1) {
      throw new Error('Could not find a "start_date" column in the Activities sheet.');
    }
    
    let convertedCount = 0;
    
    // Start from row 1 to skip headers
    for (let i = 1; i < values.length; i++) {
      const currentDateValue = values[i][dateColumnIndex];
      
      // --- REVISED LOGIC ---
      // Check if the value is a JavaScript Date object.
      // Apps Script automatically converts recognized date formats into Date objects.
      // A cell with an ISO 8601 string will remain a string.
      if (currentDateValue instanceof Date) {
        
        // The value is already a Date object, so we can directly convert it to ISO string.
        values[i][dateColumnIndex] = currentDateValue.toISOString();
        convertedCount++;
        
      }
    }
    
    if (convertedCount > 0) {
      range.setValues(values);
      const successMessage = `Successfully converted ${convertedCount} date entries to ISO 8601 format.`;
      debugLog(successMessage, 'INFO');
      Logger.log(successMessage);
      
      AppCache.invalidateActivityCaches();
      debugLog('Invalidated activity caches to reflect the data migration.', 'INFO');
    } else {
      const noChangeMessage = 'No dates required conversion.';
      debugLog(noChangeMessage, 'INFO');
      Logger.log(noChangeMessage);
    }

  } catch (e) {
    const errorMessage = `An error occurred during date migration: ${e.message}`;
    debugLog(errorMessage, 'ERROR');
    Logger.log(errorMessage);
  }
  
  debugLog('--- Date Format Migration Finished (No UI) ---', 'INFO');
}

/**
 * A manual test function to simulate a webhook event from Strava.
 * This allows testing the event processing logic without needing the full webhook pipeline.
 */
function manualTest_WebhookEvent() {
  // --- CONFIGURE YOUR TEST EVENT HERE ---

  // 1. Set the user ID for the test.
  const testUserId = '118783404';

  // 2. Set the activity ID you want to test with.
  const testActivityId = 15004044454; 

  // 3. Set the type of event you want to simulate: 'create', 'update', or 'delete'.
  const testAspectType = 'create';

  // --- End of configuration ---


  if (!testUserId) {
    Logger.log('Please edit the manualTest_WebhookEvent function in Tests.js to provide a valid User ID.'); 
    return;
  }

  const samplePayload = {
    "object_type": "activity",
    "object_id": testActivityId,
    "aspect_type": testAspectType,
    "updates": {},
    "owner_id": testUserId,
    "subscription_id": 99999,
    "event_time": Math.floor(new Date().getTime() / 1000)
  };

  debugLog(`--- STARTING MANUAL WEBHOOK TEST (type: ${testAspectType}) for user: ${testUserId} ---`, 'INFO');
  try {
    processStravaEvent(samplePayload);
    debugLog("--- MANUAL WEBHOOK TEST FINISHED ---", 'INFO');
  } catch (e) {
    debugLog(`--- MANUAL WEBHOOK TEST FAILED: ${e.message} ---`, 'ERROR');
  }
}


/**
 * A manual function to clean the Activities sheet of any disallowed entries.
 * Can be run directly from the Apps Script editor.
 */
function manualCleanDisallowedActivities() {
    debugLog('--- Starting manual cleanup of disallowed activities ---', 'INFO');
    const result = SheetService.removeDisallowedActivities();
    if (result.success) {
      debugLog(`--- Cleanup successful. Removed ${result.removedCount} activities. ---`, 'INFO');
    } else {
      debugLog(`--- Cleanup failed: ${result.error} ---`, 'ERROR');
    }
}

/**
 * A manual test function to simulate a curl request from within Apps Script.
 * It sends a POST request to the Cloudflare Worker proxy to test the full
 * end-to-end webhook pipeline (Proxy -> GAS).
 */
function manualTest_SendRequestToProxy() {
  // The URL of your Cloudflare Worker proxy.
  const props = PropertiesService.getScriptProperties();
  const proxyUrl = props.getProperty('CLOUDFLARE_WORKER_URL');

  // The JSON payload you want to send, simulating a Strava event.
  const payload = {
    "object_type": "activity",
    "object_id": 15004044454,
    "aspect_type": "create",
    "owner_id": 118783404
  };

  debugLog(`--- Sending POST request to proxy URL: ${proxyUrl} ---`, "INFO");

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true // Important: Allows us to read the response even if it's an error status (like 4xx or 5xx).
  };

  try {
    const response = UrlFetchApp.fetch(proxyUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    // Log the direct response from the proxy worker.
    debugLog(`Proxy responded with Status Code: ${responseCode}`, "INFO");
    debugLog(`Proxy responded with Body: "${responseBody}"`, "INFO");

    if (responseCode === 200) {
      debugLog(`SUCCESS: The proxy received the request successfully (responded with "${responseBody}").`, "INFO");
      debugLog("--> PLEASE CHECK the 'DebugLogs' sheet now to see if the request was forwarded and processed by your doPost function.", "INFO");
    } else {
      debugLog(`ERROR: The proxy returned an error status code: ${responseCode}. Check the Cloudflare Worker logs for more details.`, "INFO");
    }

  } catch (e) {
    debugLog(`CRITICAL ERROR while sending request to proxy: ${e.message}`, "CRITICAL");
  }
}