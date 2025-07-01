/**
 * @fileoverview Provides functions to programmatically manage the Strava webhook subscription.
 * This allows for creating, viewing, and deleting the subscription via code instead of the Strava UI.
 */


/**
 * Programmatically creates the webhook subscription.
 * This is an alternative to setting it up in the Strava UI.
 * Run this function manually from the editor once to subscribe.
 */
function createWebhookSubscription() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('STRAVA_CLIENT_ID');
  const clientSecret = props.getProperty('STRAVA_CLIENT_SECRET');
  const callbackUrl = props.getProperty('CLOUDFLARE_WORKER_URL');
  const verifyToken = props.getProperty('STRAVA_VERIFY_TOKEN');

  if (!callbackUrl || !verifyToken) {
    throw new Error("Worker URL and Strava Verify Token must be set first. Run setupWorkerUrl() and check script properties.");
  }

  const stravaApiUrl = 'https://www.strava.com/api/v3/push_subscriptions';
  
  const payload = {
    'client_id': clientId,
    'client_secret': clientSecret,
    'callback_url': callbackUrl,
    'verify_token': verifyToken
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    debugLog(`Attempting to create webhook subscription for callback: ${callbackUrl}`, 'INFO');
    const response = UrlFetchApp.fetch(stravaApiUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode === 201) {
      debugLog("SUCCESS: Webhook subscription created successfully!", 'INFO');
      Logger.log(responseBody);
    } else {
      debugLog(`ERROR: Failed to create webhook. Code: ${responseCode}. Body: ${responseBody}`, 'ERROR');
      throw new Error(`Failed to create webhook: ${responseBody}`);
    }
  } catch(e) {
    debugLog(`CRITICAL ERROR in createWebhookSubscription: ${e.message}`, 'ERROR');
    throw e;
  }
}

/**
 * Views the current webhook subscription details.
 * Useful for debugging and getting the subscription ID for deletion.
 * Run this function manually from the editor.
 * @returns {object|null} The subscription object or null.
 */
function viewWebhookSubscription() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('STRAVA_CLIENT_ID');
  const clientSecret = props.getProperty('STRAVA_CLIENT_SECRET');
  
  const url = `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`;
  
  const options = {
    'method': 'get',
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());

    if (data && data.length > 0) {
      debugLog(`Found active subscription: ID = ${data[0].id}, URL = ${data[0].callback_url}`, 'INFO');
      Logger.log(JSON.stringify(data, null, 2));
      return data[0]; // Return the first (and likely only) subscription
    } else {
      debugLog("No active webhook subscriptions found for this application.", 'INFO');
      Logger.log("No active webhook subscriptions found.");
      return null;
    }
  } catch(e) {
    debugLog(`CRITICAL ERROR in viewWebhookSubscription: ${e.message}`, 'ERROR');
    return null;
  }
}

/**
 * Deletes an active webhook subscription.
 * This provides the "unsubscribe" functionality.
 * Run this function manually from the editor.
 */
function deleteWebhookSubscription() {
  debugLog("Attempting to delete webhook subscription...", "INFO", true);
  
  // First, find the ID of the current subscription.
  const subscription = viewWebhookSubscription();

  if (!subscription || !subscription.id) {
    debugLog("No active subscription found to delete.", "INFO", true);
    return;
  }
  
  const subscriptionId = subscription.id;
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('STRAVA_CLIENT_ID');
  const clientSecret = props.getProperty('STRAVA_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
      debugLog("Strava client_id or client_secret are not set in script properties.", "CRITICAL", true);
      return;
  }

  // The client_id and client_secret must be in the URL as query parameters.
  const url = `https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}?client_id=${clientId}&client_secret=${clientSecret}`;

  // Log the URL for debugging, but redact the secret.
  debugLog(`Constructed DELETE URL: ${url.replace(clientSecret, 'REDACTED')}`, "DEBUG", true);

  const options = {
    'method': 'delete',
    'muteHttpExceptions': true
    // No payload or contentType is needed for this request. The credentials are in the URL.
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    // According to the documentation, a successful delete returns 204 No Content.
    if (responseCode === 204) {
      const successMsg = `SUCCESS: Webhook subscription with ID ${subscriptionId} has been deleted.`;
      debugLog(successMsg, "INFO", true);
      Logger.log(successMsg);
    } else {
      const errorBody = response.getContentText();
      const errorMsg = `ERROR: Failed to delete subscription. Status: ${responseCode}. Body: ${errorBody}`;
      debugLog(errorMsg, "ERROR", true);
      Logger.log(errorMsg);
    }
  } catch(e) {
    const criticalError = `CRITICAL ERROR during delete request: ${e.message}`;
    debugLog(criticalError, "CRITICAL", true);
    Logger.log(criticalError);
  }
}