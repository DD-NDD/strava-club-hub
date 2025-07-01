/**
 * @fileoverview This file contains the main entry points for the web app,
 * such as doGet(), and any global setup functions.
 */

/**
 * Handles GET requests to the web app. It now safely routes requests for
 * Strava Webhook validation, the OAuth2 callback, or normal page loads.
 * @param {object} e The event parameter from the GET request.
 * @return {HtmlService.HtmlOutput|ContentService.TextOutput} The HTML page or a JSON response.
 */
function doGet(e) {
  // Use a defensive check to ensure e.parameter is an object, even if it's empty.
  const params = e.parameter || {};

  // 1. Check for Strava Webhook subscription validation request
  // This is a fallback, as the Cloudflare Worker should handle this.
  if (params['hub.mode'] === 'subscribe' && params['hub.verify_token']) {
    debugLog("doGet received a Strava webhook validation request.", "INFO");
    return handleWebhookValidation(e);
  }

  // 2. Check for the Strava OAuth2 callback after user authorization
  if (params.code && params.scope) {
    debugLog("doGet received an OAuth callback from Strava.", "INFO");
    // handleAuthorizationCallback is defined in Strava.js and is globally available
    return handleAuthorizationCallback(e);
  }

  // 3. For all other requests, serve the main application page
  debugLog("doGet is serving the main HTML page.", "INFO");
  return HtmlService.createHtmlOutputFromFile('home.html')
    .setTitle('Endava Swimming Club')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handles the Strava webhook subscription GET request validation.
 * This function is kept inside Main.js as it's directly related to doGet.
 * @param {object} e The event parameter.
 * @returns {ContentService.TextOutput}
 */
function handleWebhookValidation(e) {
  try {
    const verifyToken = PropertiesService.getScriptProperties().getProperty('STRAVA_VERIFY_TOKEN');
    
    if (e.parameter['hub.verify_token'] === verifyToken) {
      debugLog("Strava webhook validation successful.", "INFO");
      const challenge = e.parameter['hub.challenge'];
      return ContentService.createTextOutput(JSON.stringify({ 'hub.challenge': challenge }))
                           .setMimeType(ContentService.MimeType.JSON);
    } else {
      debugLog("Strava webhook validation FAILED. Tokens do not match.", "ERROR");
      return ContentService.createTextOutput("Validation failed: Mismatched verify_token.");
    }
  } catch (err) {
    debugLog(`Error during webhook validation: ${err.message}`, "ERROR");
    return ContentService.createTextOutput("Error during validation.");
  }
}


/**
 * A centralized API router to expose server-side functions to the client-side `google.script.run`.
 * This function remains unchanged.
 * @param {string} functionName The name of the function to call.
 * @param {*} payload The argument to pass to the function.
 * @return {*} The result from the called function.
 */
function callApi(functionName, payload) {
  const allowedFunctions = {
    // Data APIs
    'getAllPools': getAllPools,
    'getAllPosts': getAllPosts,
    'getActiveEvents': getActiveEvents,
    'getPostContent': getPostContent,
    // Community APIs
    'getAllMembersData': getAllMembersData,
    'getLeaderboardData': getLeaderboardData,
    'getTopThreeThisMonth': getTopThreeThisMonth,
    // Activity APIs
    'getRecentActivities': getRecentActivities,
    'exportLeaderboard': exportLeaderboard,
    // Registration APIs
    'getEventRegistrations': getEventRegistrations,
    'registerForEvent': registerForEvent,
    'deleteRegistration': deleteRegistration,
    // Integration & Import APIs
    'getStravaAuthUrl': () => JSON.stringify({ success: true, url: StravaService.getAuthorizationUrl() }),
    'processStravaLinks': (payload) => JSON.stringify(ImportService.processStravaLinks(payload)),
    'processUploadedHtml': (payload) => JSON.stringify(ImportService.processUploadedHtml(payload)),
    // Challenge APIs
    'getActiveChallenges': getActiveChallenges,
    'getChallengeDetails': getChallengeDetails,
    'joinChallenge': joinChallenge,
  };

  if (allowedFunctions[functionName]) {
    return allowedFunctions[functionName](payload);
  } else {
    return JSON.stringify({ success: false, error: `Function ${functionName} is not a valid API endpoint.` });
  }
}