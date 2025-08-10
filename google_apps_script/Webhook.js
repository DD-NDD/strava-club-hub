/**
 * @fileoverview This file handles all incoming webhook logic from Strava,
 * received via a Cloudflare Worker proxy. It also contains the fallback
 * mechanism to re-enable manual polling if webhooks fail.
 */

/**
 * Main entry point for POST requests to the web app.
 * This function is called by the Cloudflare Worker.
 * @param {GoogleAppsScript.Events.DoPost} e The event parameter.
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  // Log a new entry to the sheet every time the function is called.
  debugLog("doPost function triggered.", "DEBUG", true);

  const rawContent = e.postData ? e.postData.contents : 'No post data received.';
  
  try {
    debugLog(`Received raw post data: ${rawContent}`, "DEBUG", true);

    const scriptProperties = PropertiesService.getScriptProperties();
    const workerSecret = scriptProperties.getProperty('WORKER_SHARED_SECRET');

    if (!workerSecret) {
      const errorMsg = "CRITICAL: WORKER_SHARED_SECRET is not set in Script Properties.";
      debugLog(errorMsg, "ERROR", true);
      throw new Error(errorMsg);
    }
    debugLog("Successfully retrieved WORKER_SHARED_SECRET.", "DEBUG", true);

    const data = JSON.parse(rawContent);

    if (data.secret !== workerSecret) {
      debugLog("Authentication failed: Received secret does not match stored secret.", "ERROR", true);
      return ContentService.createTextOutput("Authentication Failed");
    }
    
    debugLog("Webhook authenticated successfully.", "DEBUG");

    const stravaPayload = data.strava_payload;
    if (!stravaPayload) {
        const errorMsg = "Authentication successful, but 'strava_payload' was missing.";
        debugLog(errorMsg, "ERROR", true);
        throw new Error(errorMsg);
    }
    
    debugLog(stravaPayload, "DEBUG", true); // Log the full payload object to the sheet

    processStravaEvent(stravaPayload);
    
    scriptProperties.setProperty(PROPERTY_KEYS.LAST_WEBHOOK_TIMESTAMP, new Date().getTime().toString());
    debugLog("Updated last webhook timestamp.", "DEBUG", true);

    debugLog("doPost finished successfully. Returning 'Success'.", "DEBUG", true);
    return ContentService.createTextOutput("Success");

  } catch (error) {
    // Log the entire error object to the sheet for detailed analysis.
    debugLog({ error: error.message, stack: error.stack, failingContent: rawContent }, "CRITICAL", true);
    debugLog(`CRITICAL ERROR in doPost: ${error.message}.`, "ERROR", true);
    return ContentService.createTextOutput(`Error processing request: ${error.message}`);
  }
}

/**
 * Main router for processing validated Strava webhook events.
 * @param {Object} payload The Strava event object from the webhook.
 */
function processStravaEvent(payload) {
  const { object_type, aspect_type, owner_id, object_id, updates } = payload;
  debugLog(`Routing event: type=${object_type}, aspect=${aspect_type}, owner=${owner_id}`, "INFO", true);

  // Main switch to route based on the object type
  switch (object_type) {
    case 'activity':
      handleActivityEvent(aspect_type, owner_id, object_id);
      break;

    case 'athlete':
      handleAthleteEvent(aspect_type, owner_id, updates);
      break;

    default:
      debugLog(`Received webhook for an unhandled object_type: "${object_type}"`, "WARNING", true);
      break;
  }
}

/**
 * Handles all logic related to activity events (create, update, delete).
 * @param {string} aspect_type The type of change (e.g., 'create').
 * @param {string|number} owner_id The ID of the user.
 * @param {string|number} object_id The ID of the activity.
 */
function handleActivityEvent(aspect_type, owner_id, object_id) {
  // Nested switch for different activity aspects
  switch (aspect_type) {
    case 'update':
      // For 'update', first delete the old record.
      debugLog(`Update event for activity ${object_id}. Deleting existing entry.`, "DEBUG", true);
      SheetService.deleteObjectById(SHEET_NAMES.ACTIVITIES, object_id, 'id');
      // IMPORTANT: No 'break' here. We want to "fall through" to the 'create'
      // case to re-add the activity with its new data.

    case 'create':
      // This block now handles both 'create' and 'update' (after deletion).
      const accessToken = DatabaseService.getAccessToken(owner_id);
      if (!accessToken) {
        debugLog(`No access token for user ${owner_id}, cannot process activity ${object_id}.`, "ERROR", true);
        return;
      }

      const singleActivity = StravaService.getActivityById(object_id, owner_id);
      if (!singleActivity) {
        debugLog(`Could not fetch details for activity ${object_id}.`, "WARNING", true);
        return;
      }

      const wasActivityAdded = addSingleActivityToSheet(singleActivity);
      if (wasActivityAdded) {
        // Perform all post-addition tasks
        DatabaseService.updateUserData(owner_id, { ...DatabaseService.getUserData(owner_id), lastUpdated: new Date().toISOString() });
        ChallengeService.updateUserChallengeProgress(owner_id);
        AppCache.invalidateActivityCaches();
        deleteTriggersByName('processActivitySyncQueue');
        debugLog(`Webhook for activity ${object_id} processed successfully.`, 'INFO', true);
      }
      break;

    case 'delete':
      SheetService.deleteObjectById(SHEET_NAMES.ACTIVITIES, object_id, 'id');
      AppCache.invalidateActivityCaches();
      break;

    default:
      debugLog(`Received unhandled aspect_type for activity: "${aspect_type}"`, "WARNING", true);
      break;
  }
}

/**
 * Handles all logic related to athlete events (e.g., deauthorization).
 * @param {string} aspect_type The type of change ('update').
 * @param {string|number} owner_id The ID of the user.
 * @param {Object} updates An object containing the changed fields.
 */
function handleAthleteEvent(aspect_type, owner_id, updates) {
  if (aspect_type === 'update' && updates && updates.authorized === 'false') {
    debugLog(`User ${owner_id} has deauthorized the application. Processing...`, "WARNING", true);
    DatabaseService.deauthorizeUser(owner_id);
  }
}

/**
 * Monitors the health of the webhook system.
 * This function is defined in Webhook.js.
 */
function monitorWebhookHealth() {
  debugLog("Running daily webhook health check...", "INFO");
  const props = PropertiesService.getScriptProperties();
  const lastWebhookTime = props.getProperty(PROPERTY_KEYS.LAST_WEBHOOK_TIMESTAMP);

  if (!lastWebhookTime) {
    debugLog("No webhook timestamp found. Activating manual sync as a precaution.", "WARNING");
    setupActivitySyncTrigger(); //
    return;
  }

  const timeDifferenceHours = (new Date().getTime() - parseInt(lastWebhookTime, 10)) / (1000 * 60 * 60);

  if (timeDifferenceHours > 24) {
    debugLog(`Webhook system appears to be down (last event > 24h ago). Re-activating manual sync trigger.`, "ERROR");
    setupActivitySyncTrigger(); //
  } else {
    debugLog(`Webhook system is healthy. Last event received ${timeDifferenceHours.toFixed(2)} hours ago.`, "INFO");
  }
}

/**
 * Creates the daily trigger for monitoring webhook health.
 * This function is defined in Webhook.js.
 */
function setupWebhookMonitoringTrigger() {
  deleteTriggersByName('monitorWebhookHealth'); //
  ScriptApp.newTrigger('monitorWebhookHealth')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
  debugLog("Webhook health monitoring trigger has been created.", "INFO");
}