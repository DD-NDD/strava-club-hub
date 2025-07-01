/**
 * @fileoverview This file manages all time-based triggers and background
 * processing tasks, such as syncing activities from Strava.
 */

/**
 * Adds a list of user IDs to the processing queue.
 * @param {Array<string|number>} userIds An array of user IDs to add.
 */
function enqueueUsersForSync(userIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // Wait up to 15s for lock

  try {
    const props = PropertiesService.getScriptProperties();
    const queueString = props.getProperty(ACTIVITY_QUEUE.QUEUE_KEY);
    const queue = queueString ? JSON.parse(queueString) : [];
    
    userIds.forEach(id => {
      if (!queue.includes(id)) {
        queue.push(id);
      }
    });
    
    props.setProperty(ACTIVITY_QUEUE.QUEUE_KEY, JSON.stringify(queue));
    debugLog(`Enqueued ${userIds.length} users. Queue size is now ${queue.length}.`, 'INFO');
    
    // If the trigger isn't already running, start it.
    setupActivitySyncTrigger();

  } finally {
    lock.releaseLock();
  }
}

/**
 * The main function to be run by a trigger. Processes a batch of users from the queue.
 */
function processActivitySyncQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { // Wait 10s
    debugLog("Could not obtain sync lock. Another process is likely running.", "WARNING");
    return;
  }
  
  try {
    const props = PropertiesService.getScriptProperties();
    let queue = JSON.parse(props.getProperty(ACTIVITY_QUEUE.QUEUE_KEY) || '[]');
    
    if (queue.length === 0) {
      debugLog("Activity sync queue is empty. Re-filling with all users for next cycle.", "INFO");
      const allUsers = DatabaseService.getAllUsers();
      const allUserIds = allUsers.map(user => user.id);
      enqueueUsersForSync(allUserIds);
      
      queue = JSON.parse(props.getProperty(ACTIVITY_QUEUE.QUEUE_KEY) || '[]');
      if (queue.length === 0) {
        debugLog("No users found to add to queue. Deleting trigger.", "INFO");
        deleteTriggersByName('processActivitySyncQueue');
        lock.releaseLock();
        return;
      }
    }

    const usersToProcess = queue.splice(0, ACTIVITY_QUEUE.MAX_USERS_PER_RUN);
    debugLog(`Processing ${usersToProcess.length} users from queue. Remaining: ${queue.length}`, 'INFO');

    let activitiesWereAdded = false;
    for (const userId of usersToProcess) {
      if (syncActivitiesForUser(userId)) {
        activitiesWereAdded = true;
      }
    }
    
    // If we added any new activities, invalidate the caches.
    if (activitiesWereAdded) {
      AppCache.invalidateActivityCaches();
    }
    
    // Update the queue in properties
    props.setProperty(ACTIVITY_QUEUE.QUEUE_KEY, JSON.stringify(queue));

  } catch (e) {
    debugLog(`Error in processActivitySyncQueue: ${e.message}`, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Syncs activities for a single user if they haven't been updated recently.
 * This is the final version incorporating all recent logic changes.
 *
 * @param {string|number} userId The ID of the user to sync.
 * @param {boolean} [forceSync=false] - If true, ignores the last updated timestamp and syncs anyway.
 * @return {boolean} True if new activities were added, false otherwise.
 */
function syncActivitiesForUser(userId, forceSync = false, sheetLog = false) {
  const user = DatabaseService.getUserData(userId); //
  if (!user) {
    debugLog(`User not found with ID: ${userId}. Skipping sync.`, 'WARNING', sheetLog); //
    return false;
  }

  const now = new Date();
  
  // 1. Bypass update interval check if forceSync is enabled.
  if (forceSync) {
    debugLog(`Force sync enabled for user ${userId}. Bypassing update interval check.`, 'INFO', sheetLog); //
  } else {
    const lastUpdated = user.lastUpdated ? new Date(user.lastUpdated) : null;
    if (lastUpdated && (now - lastUpdated) / (1000 * 60 * 60) < ACTIVITY_QUEUE.UPDATE_INTERVAL_HOURS) { //
      debugLog(`Skipping sync for user ${userId}, updated recently.`, 'DEBUG', sheetLog); //
      return false;
    }
  }

  // Sync activities from the last 30 days.
  const afterTimestamp = Math.floor((now.getTime() / 1000) - (30 * 24 * 60 * 60));
  const beforeTimestamp = Math.floor(now.getTime() / 1000);
  
  // Fetch only 'Swim' activities from Strava.
  const newActivities = StravaService.getAthleteActivities(userId, afterTimestamp, beforeTimestamp); //

  if (newActivities && newActivities.length > 0) {
    
    // 2. Prepare data to flatten the athlete_id from the nested object provided by Strava.
    const preparedActivities = newActivities.map(activity => ({
      ...activity,
      athlete_id: activity.athlete ? activity.athlete.id : null
    }));

    // 3. Robust duplicate check by normalizing all IDs to strings.
    const allExistingActivities = SheetService.getDataAsObjects(SHEET_NAMES.ACTIVITIES); //
    const existingActivityIds = new Set(allExistingActivities.map(a => String(a.id)));
    const activitiesToWrite = preparedActivities.filter(a => !existingActivityIds.has(String(a.id)));

    if (activitiesToWrite.length > 0) {
      SheetService.appendObjects(SHEET_NAMES.ACTIVITIES, activitiesToWrite); //
      debugLog(`Added ${activitiesToWrite.length} new activities for user ${userId}.`, 'INFO', sheetLog); //
      
      // Update the user's lastUpdated timestamp in the database.
      const updatedUser = { ...user, lastUpdated: now.toISOString() };
      DatabaseService.updateUserData(userId, updatedUser); //

      ChallengeService.updateUserChallengeProgress(userId); // Update challenge progress for this user.

      return true;
    }
  }
  
  debugLog(`No new activities to add for user ${userId}.`, 'DEBUG', sheetLog); //
  return false;
}

/**
 * Creates a trigger to process the activity queue every 15 minutes.
 */
function setupActivitySyncTrigger() {
  deleteTriggersByName('processActivitySyncQueue'); // Ensure no duplicates
  ScriptApp.newTrigger('processActivitySyncQueue')
    .timeBased()
    .everyMinutes(15)
    .create();
  debugLog("Activity sync trigger created.", "INFO");
}

/**
 * Deletes all triggers with a given handler function name.
 * @param {string} functionName The name of the function handler.
 */
function deleteTriggersByName(functionName) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Forces a refresh of the access token and profile data for every user
 * who has a refresh token.
 * This function directly calls the Strava API for each user and updates the
 * Database sheet. It should be run manually for maintenance.
 */
function forceRefreshAllUserProfiles() {
  debugLog("Starting a forced profile data refresh for all users.", "INFO");
  const allUsers = DatabaseService.getAllUsers();
  
  if (!allUsers || allUsers.length === 0) {
    debugLog("No users found to refresh.", "WARNING");
    return;
  }
  
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  // Loop through every user in the database
  for (const user of allUsers) {
    const userId = user.id;
    // We can only refresh users who have a refresh token stored
    if (!user.refreshToken) {
      debugLog(`Skipping user ${userId}: No refresh token found.`, "DEBUG");
      skippedCount++;
      continue;
    }
    
    try {
      // Step 1: Refresh the access token using the existing service function
      const refreshedTokenInfo = StravaService.refreshAccessToken(userId);
      
      if (refreshedTokenInfo && refreshedTokenInfo.accessToken) {
        // Step 2: If token refresh is successful, fetch the latest athlete profile from Strava
        const newAccessToken = refreshedTokenInfo.accessToken;
        const athleteInfo = StravaService.getAthleteInfo(newAccessToken);
        
        if (athleteInfo && athleteInfo.id) {
          // Step 3: Get the user's current data from our database,
          // which now includes the newly refreshed tokens from Step 1.
          const currentUserData = DatabaseService.getUserData(userId);
          
          // Step 4: Merge the latest profile info from Strava with our current data.
          // This ensures we keep our tokens while updating profile details like name or avatar.
          const updatedUserData = {
            ...currentUserData,
            ...athleteInfo 
          };
          
          // Step 5: Save the completely new, merged data back to the Database sheet.
          DatabaseService.updateUserData(userId, updatedUserData);
          debugLog(`Successfully refreshed profile for user ${userId}.`, "INFO");
          successCount++;
        } else {
          throw new Error(`Failed to fetch athlete info from Strava for user ${userId} after token refresh.`);
        }
      } else {
        throw new Error(`Token refresh failed for user ${userId}.`);
      }
    } catch (e) {
      debugLog(`Error refreshing profile for user ${userId}: ${e.message}`, "ERROR");
      errorCount++;
    }
  }
  
  debugLog("--- Full Profile Refresh Complete ---", "INFO");
  debugLog(`Summary: ${successCount} succeeded, ${errorCount} failed, ${skippedCount} skipped.`, "INFO");
  
  // IMPORTANT: After updating user profiles (names, avatars, etc.), 
  // the member cache must be cleared to reflect the changes immediately.
  AppCache.remove(CACHE_KEYS.ALL_MEMBERS);
  debugLog("Invalidated the all_members cache.", "INFO");
}

/**
 * The main function to be run by a trigger to process community challenges.
 */
function processCommunityChallenges() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { // Wait 10s
    debugLog("Could not obtain community challenge lock.", "WARNING");
    return;
  }
  try {
    ChallengeService.updateCommunityChallengeProgress();
  } catch (e) {
    debugLog(`Error in processCommunityChallenges: ${e.message}`, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a trigger to process community challenges hourly.
 * Run this function once manually from the editor to set up the trigger.
 */
function setupCommunityChallengeTrigger() {
  deleteTriggersByName('processCommunityChallenges'); // Prevent duplicates
  ScriptApp.newTrigger('processCommunityChallenges')
    .timeBased()
    .everyHours(1)
    .create();
  debugLog("Community challenge processing trigger created.", "INFO");
}

