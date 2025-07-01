/**
 * @fileoverview API endpoints related to the community, members, and leaderboards.
 */

function getAllMembersData() {
  try {
    const allMembers = DatabaseService.getAllUsers();
    // Add authorization status to each member
    const membersWithStatus = allMembers.map(member => ({
      ...member,
      isAuthorized: !!(member.accessToken && member.refreshToken)
    }));
    return JSON.stringify({ success: true, data: membersWithStatus });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

function getLeaderboardData(period = 'this_month') {
  const now = new Date();
  let startDate, endDate;
  let cacheKey;
  let cacheDuration; // Variable to hold the chosen cache duration

  switch (period) {
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      cacheKey = CACHE_KEYS.LEADERBOARD_LAST_MONTH;
      // Last month's data is static, so use a very long cache to improve performance.
      cacheDuration = CACHE_DURATIONS.SUPPER_LONG; // 7 days
      break;
    case 'challenge':
      // TODO: Make these configurable, perhaps from a settings sheet
      startDate = new Date('2025-06-01T00:00:00+07:00');
      endDate = new Date('2025-06-20T23:59:59+07:00');
      cacheKey = CACHE_KEYS.LEADERBOARD_CHALLENGE;
      cacheDuration = CACHE_DURATIONS.MEDIUM; // 1 hour
      break;
    default: // this_month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      cacheKey = CACHE_KEYS.LEADERBOARD_THIS_MONTH;
      cacheDuration = CACHE_DURATIONS.MEDIUM; // 1 hour
  }

  let leaderboard = AppCache.get(cacheKey);
  if (leaderboard) {
    return JSON.stringify({ success: true, data: leaderboard, source: 'cache' });
  }

  try {
    // Pass the 'period' string to the service layer so it knows which sheet to use.
    leaderboard = LeaderboardService.getLeaderboardForPeriod(startDate, endDate, period);
    
    // Set the cache using the dynamically assigned duration.
    AppCache.set(cacheKey, leaderboard, cacheDuration);
    
    return JSON.stringify({ success: true, data: leaderboard, source: 'sheet' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

function getTopThreeThisMonth() {
    const cacheKey = CACHE_KEYS.TOP_THREE_THIS_MONTH;
    let topThree = AppCache.get(cacheKey);
    if (topThree) {
        return JSON.stringify({ success: true, data: topThree, source: 'cache' });
    }

    try {
        topThree = LeaderboardService.getTopThreeLeaderboard();
        AppCache.set(cacheKey, topThree, CACHE_DURATIONS.MEDIUM);

        return JSON.stringify({ success: true, data: topThree, source: 'sheet' });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}

/**
 * Gets the user data object for the person currently using the web app.
 * This relies on the user being logged into their Google Account.
 * @returns {string} A JSON string of the API response containing the user's data.
 */
function getCurrentUserData() {
    try {
        const service = StravaService.getOAuth2Service();
        // Check if the current user has a valid token stored in their personal UserProperties
        if (!service.hasAccess()) {
            return JSON.stringify({ success: false, error: "User is not authenticated.", data: null });
        }
        
        // The OAuth2 library stores the token with a user-specific prefix.
        // We need to fetch their info from our database using their athlete ID.
        // A simple way is to get the accessToken and then fetch the main profile.
        const accessToken = service.getAccessToken();
        const athleteInfo = StravaService.getAthleteInfo(accessToken);
        
        if (athleteInfo && athleteInfo.id) {
            const userData = DatabaseService.getUserData(athleteInfo.id);
            if (userData) {
                return JSON.stringify({ success: true, data: userData });
            }
        }
        throw new Error("Could not retrieve current user data.");

    } catch (e) {
        debugLog(`Error in getCurrentUserData: ${e.message}`, 'ERROR');
        return JSON.stringify({ success: false, error: e.message, data: null });
    }
}