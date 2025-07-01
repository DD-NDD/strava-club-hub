/**
 * @fileoverview This service is responsible for all logic related to
 * calculating and formatting leaderboards. It fetches data via other services
 * and processes it.
 */

class LeaderboardService {

  /**
   * Fetches swim activities from the appropriate sheet and processes them into a leaderboard.
   * For 'this_month' and 'last_month', it uses pre-filtered sheets for performance.
   * For other periods (like 'challenge'), it filters the main activity sheet.
   * @param {Date} startDate The start date for the period.
   * @param {Date} endDate The end date for the period.
   * @param {string} period The name of the period ('this_month', 'last_month', etc.).
   * @return {Array<Object>} A sorted array of athlete summaries (the leaderboard).
   */
  static getLeaderboardForPeriod(startDate, endDate, period) {
    let activitiesToProcess;
    let sheetToRead;

    // 1. Determine which sheet to use based on the period for efficiency.
    switch (period) {
      case 'this_month':
        sheetToRead = SHEET_NAMES.ACTIVITIES_THIS_MONTH;
        debugLog(`Fetching activities from pre-filtered sheet: ${sheetToRead}`, "INFO");
        activitiesToProcess = SheetService.getDataAsObjects(sheetToRead);
        break;
      case 'last_month':
        sheetToRead = SHEET_NAMES.ACTIVITIES_LAST_MONTH;
        debugLog(`Fetching activities from pre-filtered sheet: ${sheetToRead}`, "INFO");
        activitiesToProcess = SheetService.getDataAsObjects(sheetToRead);
        break;
      default:
        // Fallback to filtering the main 'Activities' sheet for custom periods (e.g., 'challenge').
        sheetToRead = SHEET_NAMES.ACTIVITIES;
        debugLog(`Fetching all activities from ${sheetToRead} and filtering for the period.`, "INFO");
        const allActivities = SheetService.getDataAsObjects(sheetToRead);
        
        // Filter for swims within the date range
        activitiesToProcess = allActivities.filter(activity => {
          if (activity.type !== STRAVA_SETTINGS.ACTIVITY_TYPE_TO_SYNC || !activity.start_date) {
            return false;
          }
          const activityDate = new Date(activity.start_date);
          return activityDate >= startDate && activityDate <= endDate;
        });
    }

    // 2. Process the list of activities into a leaderboard summary.
    return this._processActivities(activitiesToProcess);
  }

  /**
   * Fetches and enriches the Top 3 leaderboard data directly from the pre-calculated sheet.
   * This method assumes the 'Leaderboard_Top3' sheet contains 'Athlete ID' and 'Total Distance (m)'.
   * @returns {Array<Object>} An array of the top 3 athletes with their details.
   */
  static getTopThreeLeaderboard() {
    debugLog("Fetching Top 3 leaderboard data directly from Leaderboard_Top3 sheet.", "INFO");
    
    try {
      // Read data from the pre-calculated Google Sheet.
      const rawTop3Data = SheetService.getDataAsObjects(SHEET_NAMES.LEADERBOARD_TOP3);

      // Fetch all member data to get names and profile pictures.
      const allMembers = DatabaseService.getAllUsers();
      const memberMap = new Map(allMembers.map(m => [String(m.id), m])); 

      // Enrich the raw top 3 data with athlete names and profile pictures.
      const enrichedTop3 = rawTop3Data.map(row => {
        const athleteId = String(row['Athlete ID']); 
        const memberInfo = memberMap.get(athleteId);

        return {
          athlete_id: athleteId,
          athlete_name: memberInfo ? memberInfo.name : 'Unknown Athlete',
          profile: memberInfo ? memberInfo.profile : 'https://www.gravatar.com/avatar/?d=mp', 
          total_distance: parseFloat(row['Total Distance (m)']) || 0 
        };
      });

      enrichedTop3.sort((a, b) => b.total_distance - a.total_distance);
      return enrichedTop3;

    } catch (e) {
      debugLog(`Error in LeaderboardService.getTopThreeLeaderboard: ${e.message}`, 'ERROR');
      throw new Error(`Failed to retrieve Top 3 leaderboard: ${e.message}`);
    }
  }

  /**
   * Private helper to process a list of activities into a sorted leaderboard.
   * @param {Array<Object>} activities An array of activity objects.
   * @return {Array<Object>} A sorted array of athlete summaries.
   */
  static _processActivities(activities) {
    if (!activities || activities.length === 0) {
      return [];
    }
    
    const athleteSummaries = {};
    const allMembers = DatabaseService.getAllUsers(); 

    activities.forEach(activity => {
      if (!activity.athlete_id) return; 

      const athleteId = String(activity.athlete_id).trim().split('.')[0];
      const distance = parseFloat(activity.distance) || 0;
      const movingTime = parseFloat(activity.moving_time) || 0; // Get moving time

      if (!athleteSummaries[athleteId]) {
        const memberInfo = allMembers.find(m => m.id === athleteId);
        
        if (!memberInfo) {
          debugLog(`Lookup FAILED: Could not find member with normalized ID [${athleteId}]`, 'WARNING');
        }

        athleteSummaries[athleteId] = {
          athlete_id: athleteId,
          athlete_name: memberInfo ? memberInfo.name : 'Unknown Athlete',
          profile: memberInfo ? memberInfo.profile : null,
          total_distance: 0,
          activity_count: 0,
          total_moving_time: 0, // Initialize total time
        };
      }

      athleteSummaries[athleteId].total_distance += distance;
      athleteSummaries[athleteId].activity_count += 1;
      athleteSummaries[athleteId].total_moving_time += movingTime; // Add to total time
    });

    const leaderboardArray = Object.values(athleteSummaries);
    leaderboardArray.sort((a, b) => b.total_distance - a.total_distance);

    return leaderboardArray;
  }
}