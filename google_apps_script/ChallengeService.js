// swimming_clb/ChallengeService.js

/**
 * @fileoverview This service handles all logic related to challenges,
 * including progress tracking and participant management.
 */
class ChallengeService {

  /**
   * Updates the progress for all challenges a specific user has joined.
   * @param {string|number} userId The ID of the user.
   */
  static updateUserChallengeProgress(userId) {
    debugLog(`Starting challenge progress update for user: ${userId}`, 'INFO');
    try {
      const participantEntries = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS)
        .filter(p => String(p.UserID) === String(userId));

      if (participantEntries.length === 0) {
        debugLog(`User ${userId} has not joined any challenges.`, 'DEBUG');
        return;
      }

      const allChallenges = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGES);
      const userActivities = SheetService.getDataAsObjects(SHEET_NAMES.ACTIVITIES)
        .filter(a => String(a.athlete_id) === String(userId));
      
      for (const entry of participantEntries) {
        const challenge = allChallenges.find(c => String(c.ChallengeID) === String(entry.ChallengeID) && c.Status === 'Active');
        if (!challenge) continue;

        const startDate = new Date(challenge.StartDate);
        const endDate = new Date(challenge.EndDate);

        const progress = userActivities
          .filter(activity => {
            const activityDate = new Date(activity.start_date);
            return activityDate >= startDate && activityDate <= endDate;
          })
          .reduce((sum, activity) => sum + (parseFloat(activity.distance) || 0), 0);
        
        const updatedEntry = { Progress: progress, LastUpdated: new Date() };
        
        // This is a simplified update; for performance on very large sheets,
        // a more direct row update method would be better.
        this._updateParticipantProgress(entry.ChallengeID, userId, updatedEntry);
      }

    } catch (e) {
      debugLog(`Error updating challenge progress for user ${userId}: ${e.message}`, 'ERROR');
    }
  }

  /**
   * Updates progress for all active community-wide challenges.
   * Designed to be called by a time-based trigger.
   */
  static updateCommunityChallengeProgress() {
    debugLog('Starting community challenge progress update.', 'INFO');
    const allChallenges = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGES);
    const activeCommunityChallenges = allChallenges.filter(c => c.Status === 'Active' && c.Type === 'COMMUNITY');
    
    if (activeCommunityChallenges.length === 0) {
      debugLog('No active community challenges to update.', 'INFO');
      return;
    }

    const allActivities = SheetService.getDataAsObjects(SHEET_NAMES.ACTIVITIES);

    for (const challenge of activeCommunityChallenges) {
        const startDate = new Date(challenge.StartDate);
        const endDate = new Date(challenge.EndDate);

        const totalProgress = allActivities
            .filter(activity => {
                const activityDate = new Date(activity.start_date);
                return activityDate >= startDate && activityDate <= endDate;
            })
            .reduce((sum, activity) => sum + (parseFloat(activity.distance) || 0), 0);
        
        // We use a special UserID `_COMMUNITY_` to store the total progress.
        this._updateParticipantProgress(challenge.ChallengeID, '_COMMUNITY_', { Progress: totalProgress, LastUpdated: new Date() });
    }
  }

  /**
   * A helper to find and update a specific participant's progress in the sheet.
   * @param {string} challengeId
   * @param {string} userId
   * @param {object} updatedData
   * @private
   */
  static _updateParticipantProgress(challengeId, userId, updatedData) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHALLENGE_PARTICIPANTS);
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const challengeIdCol = headers.indexOf('ChallengeID');
      const userIdCol = headers.indexOf('UserID');

      const rowIndex = data.findIndex((row, index) => 
          index > 0 && 
          String(row[challengeIdCol]) === String(challengeId) && 
          String(row[userIdCol]) === String(userId)
      );
      
      if (rowIndex !== -1) {
          // Update existing row
          headers.forEach((header, colIndex) => {
              if (updatedData.hasOwnProperty(header)) {
                  sheet.getRange(rowIndex + 1, colIndex + 1).setValue(updatedData[header]);
              }
          });
          debugLog(`Updated progress for user ${userId} in challenge ${challengeId}.`, 'DEBUG');
      } else {
          // Append new row if not exists
          const newRow = { ChallengeID: challengeId, UserID: userId, ...updatedData };
          SheetService.appendObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS, [newRow]);
          debugLog(`Created progress entry for user ${userId} in challenge ${challengeId}.`, 'DEBUG');
      }
      
      // Invalidate cache for this challenge
      AppCache.remove(`${CACHE_KEYS.CHALLENGE_DETAILS_PREFIX}${challengeId}`);
  }
}