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
  debugLog("doPost function triggered.", "INFO", true);

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
    
    debugLog("Webhook authenticated successfully.", "INFO");

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

    debugLog("doPost finished successfully. Returning 'Success'.", "INFO", true);
    return ContentService.createTextOutput("Success");

  } catch (error) {
    // Log the entire error object to the sheet for detailed analysis.
    debugLog({ error: error.message, stack: error.stack, failingContent: rawContent }, "CRITICAL", true);
    debugLog(`CRITICAL ERROR in doPost: ${error.message}.`, "ERROR", true);
    return ContentService.createTextOutput(`Error processing request: ${error.message}`);
  }
}

/**
 * Processes the validated Strava event data.
 * This function is defined in Webhook.js.
 * @param {Object} payload The Strava event object.
 */
function processStravaEvent(payload) {
  const { object_type, aspect_type, owner_id, object_id } = payload;
  debugLog(`Processing event: owner=${owner_id}, type=${object_type}, aspect=${aspect_type}, object=${object_id}`, "INFO", true);

  if (object_type !== 'activity') {
    return;
  }

  if (aspect_type === 'create' || aspect_type === 'update') {
    const activitiesWereAdded = syncActivitiesForUser(owner_id, true, true); // forceSync = true, sheetLog = true
    if (activitiesWereAdded) {
      AppCache.invalidateActivityCaches(); //
      deleteTriggersByName('processActivitySyncQueue'); //
      debugLog('Webhook processed. Manual sync trigger removed to prevent duplicates.', 'INFO', true);
    }
  } 
  else if (aspect_type === 'delete') {
    debugLog(`Activity ${object_id} was deleted for owner ${owner_id}. No action taken.`, "INFO", true);
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