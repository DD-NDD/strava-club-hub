/**
 * @fileoverview This module centralizes all interactions with the Strava API,
 * including OAuth2 authentication, API calls, and HTML parsing for imports.
 */

class StravaService {
  /**
   * Gets the singleton instance of the configured Strava OAuth2 service.
   * This method ensures that the service is only created once.
   * @return {OAuth2.Service} The configured OAuth2 service.
   */
  static getOAuth2Service() {
    // Check if the service has been initialized on the class as a static property.
    if (!StravaService.oAuth2Service) {
      const scriptProperties = PropertiesService.getScriptProperties();
      StravaService.oAuth2Service = OAuth2.createService('Strava')
        .setAuthorizationBaseUrl('https://www.strava.com/oauth/authorize')
        .setTokenUrl('https://www.strava.com/oauth/token')
        .setClientId(scriptProperties.getProperty('STRAVA_CLIENT_ID'))
        .setClientSecret(scriptProperties.getProperty('STRAVA_CLIENT_SECRET'))
        .setCallbackFunction('handleAuthorizationCallback') // Must be a top-level function
        .setPropertyStore(PropertiesService.getUserProperties())
        .setParam('redirect_uri', scriptProperties.getProperty('STRAVA_REDIRECT_URI'))
        .setScope('activity:read_all'); // Request necessary permissions
    }
    return StravaService.oAuth2Service;
  }

  /**
   * Generates the authorization URL for the user to start the OAuth2 flow.
   * @return {string} The Strava authorization URL.
   */
  static getAuthorizationUrl() {
    return this.getOAuth2Service().getAuthorizationUrl();
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   * @param {string} code The authorization code from the callback.
   * @return {Object} The JSON response from Strava containing tokens.
   */
  static exchangeCodeForTokens(code) {
    // This method is essentially a wrapper for handleCallback for clarity.
    // The OAuth2 library internally handles the token exchange.
    const service = this.getOAuth2Service();
    const isAuthorized = service.handleCallback({ parameter: { code } });
    if (isAuthorized) {
        return service.getToken();
    }
    return null;
  }

  /**
   * Fetches the authorized user's profile from the Strava API.
   * @param {string} accessToken The user's access token.
   * @return {Object} The athlete's profile information.
   */
  static getAthleteInfo(accessToken) {
    const response = UrlFetchApp.fetch('https://www.strava.com/api/v3/athlete', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    return JSON.parse(response.getContentText());
  }

/**
   * Fetches a user's activities from Strava for a given period.
   * It now filters for an array of activity types defined in constants.
   * @param {string|number} userId The user's Strava ID.
   * @param {number} afterTimestamp A Unix timestamp for the start of the period.
   * @param {number} beforeTimestamp A Unix timestamp for the end of the period.
   * @return {Array<Object>|null} An array of allowed activities, or null on failure.
   */
  static getAthleteActivities(userId, afterTimestamp, beforeTimestamp) {
    let accessToken = DatabaseService.getAccessToken(userId);
    if (!accessToken) {
      debugLog(`No access token for user ${userId}. Attempting refresh.`, 'WARNING');
      const refreshed = this.refreshAccessToken(userId);
      if(refreshed) {
        accessToken = refreshed.accessToken;
      } else {
        debugLog(`Token refresh failed for user ${userId}. Cannot fetch activities.`, 'ERROR');
        return null;
      }
    }

    const apiUrl = `https://www.strava.com/api/v3/athlete/activities?before=${beforeTimestamp}&after=${afterTimestamp}&per_page=100`;
    const options = {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    let activities = [];

    if (responseCode === 200) {
      activities = JSON.parse(response.getContentText());
    } else if (responseCode === 401) {
      debugLog(`Received 401 for user ${userId}. Attempting one-time token refresh.`, 'INFO');
      const refreshed = this.refreshAccessToken(userId);
      if (refreshed) {
        options.headers['Authorization'] = 'Bearer ' + refreshed.accessToken;
        const retryResponse = UrlFetchApp.fetch(apiUrl, options);
        if (retryResponse.getResponseCode() === 200) {
          activities = JSON.parse(retryResponse.getContentText());
        }
      }
    } else {
        debugLog(`Failed to fetch activities for user ${userId}. Code: ${responseCode}, Response: ${response.getContentText()}`, 'ERROR');
        return null;
    }
    
    // Filter activities to include any type present in the ALLOWED_ACTIVITY_TYPES array.
    if (activities && activities.length > 0) {
      const allowedActivities = activities.filter(activity =>
        STRAVA_SETTINGS.ALLOWED_ACTIVITY_TYPES.includes(activity.type)
      );
      debugLog(`Fetched ${activities.length} total activities, filtered down to ${allowedActivities.length} allowed types: [${STRAVA_SETTINGS.ALLOWED_ACTIVITY_TYPES.join(', ')}] for user ${userId}.`, 'DEBUG');
      return allowedActivities;
    }

    return []; // Return an empty array if no activities were found
  }

/**
   * Fetches a single activity by its ID and handles token refresh.
   * The function now takes a userId to manage the authentication state.
   * @param {string|number} activityId The ID of the activity to fetch.
   * @param {string|number} userId The ID of the user who owns the activity.
   * @return {Object|null} The activity object, or null on failure.
   */
  static getActivityById(activityId, userId) {
    let accessToken = DatabaseService.getAccessToken(userId);
    if (!accessToken) {
      debugLog(`No access token for user ${userId}. Attempting refresh before API call.`, "WARNING");
      const refreshed = this.refreshAccessToken(userId);
      if(refreshed) {
        accessToken = refreshed.accessToken;
      } else {
        debugLog(`Initial token refresh failed for user ${userId}. Cannot fetch activity ${activityId}.`, 'ERROR');
        return null;
      }
    }

    const apiUrl = `https://www.strava.com/api/v3/activities/${activityId}`;
    const options = {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    };

    let response = UrlFetchApp.fetch(apiUrl, options);
    let responseCode = response.getResponseCode();

    // Handle token expiration during the API call
    if (responseCode === 401) {
      debugLog(`Received 401 for user ${userId} when fetching activity ${activityId}. Retrying after refresh.`, 'INFO');
      const refreshed = this.refreshAccessToken(userId);
      if (refreshed && refreshed.accessToken) {
        // Retry the API call with the new token
        options.headers['Authorization'] = 'Bearer ' + refreshed.accessToken;
        response = UrlFetchApp.fetch(apiUrl, options);
        responseCode = response.getResponseCode();
      }
    }

    // Final check on the response
    if (responseCode === 200) {
      debugLog(`Successfully fetched activity ID: ${activityId}`, "INFO");
      return JSON.parse(response.getContentText());
    } else {
      debugLog(`Failed to fetch activity ${activityId} after all attempts. Code: ${responseCode}`, 'ERROR');
      return null;
    }
  }

  /**
   * Refreshes an expired access token using a refresh token.
   * @param {string|number} userId The user's ID.
   * @return {{accessToken: string, expiresAt: Date}|null} The new token info, or null.
   */
  static refreshAccessToken(userId) {
    const refreshToken = DatabaseService.getRefreshToken(userId);
    if (!refreshToken) {
      debugLog(`No refresh token found for user ${userId}.`, 'ERROR');
      return null;
    }
    
    try {
      const scriptProperties = PropertiesService.getScriptProperties();
      const response = UrlFetchApp.fetch('https://www.strava.com/oauth/token', {
        method: 'post',
        payload: {
          client_id: scriptProperties.getProperty('STRAVA_CLIENT_ID'),
          client_secret: scriptProperties.getProperty('STRAVA_CLIENT_SECRET'),
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }
      });
      
      const tokenData = JSON.parse(response.getContentText());
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Update the user's data in our database
      const user = DatabaseService.getUserData(userId);
      user.accessToken = tokenData.access_token;
      user.refreshToken = tokenData.refresh_token; // Strava may send a new refresh token
      user.expiresAt = expiresAt.toISOString();
      DatabaseService.updateUserData(userId, user);

      debugLog(`Successfully refreshed token for user ${userId}.`, 'INFO');
      return { accessToken: tokenData.access_token, expiresAt };
      
    } catch (e) {
      debugLog(`Token refresh API call failed for user ${userId}: ${e.message}`, 'ERROR');
      // Potentially mark user as needing re-authentication
      return null;
    }
  }

  /**
   * Parses activity details from a Strava activity page's HTML content.
   * @param {string} htmlContent The HTML of the activity page.
   * @return {Object|null} The parsed activity details.
   */
  static parseActivityPageFromHtml(htmlContent) {
    try {
      const $ = Cheerio.load(htmlContent);
      const data = JSON.parse($('#__NEXT_DATA__').html());
      const activity = data?.props?.pageProps?.activity;

      if (!activity) return null;

      return {
        id: activity.id,
        athlete_id: activity.athlete?.id,
        name: activity.name,
        type: activity.activityKind?.sportType,
        distance: activity.scalars?.distance,
        moving_time: activity.scalars?.movingTime,
        start_date: activity.startLocal,
      };
    } catch (e) {
      debugLog(`Error parsing activity page HTML: ${e.message}`, 'ERROR');
      return null;
    }
  }
}

// Initialize the static property on the class. This is the correct way for Apps Script V8.
StravaService.oAuth2Service = null;


/**
 * Top-level function to handle the Strava OAuth2 callback.
 * This function name must match the one set in `setCallbackFunction`.
 * @param {object} request The request object from the redirect.
 * @return {HtmlService.HtmlOutput} An HTML page showing success or failure.
 */
function handleAuthorizationCallback(request) {
  const service = StravaService.getOAuth2Service();
  const isAuthorized = service.handleCallback(request);
  
  if (isAuthorized) {
    try {
      const accessToken = service.getAccessToken();
      const athleteInfo = StravaService.getAthleteInfo(accessToken);
      const tokenData = service.getToken(); // Gets the full token object

      const userData = {
        ...athleteInfo, // Spread raw athlete data
        accessToken: accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      };

      DatabaseService.updateUserData(athleteInfo.id, userData);
      
      // Enqueue the new user for an initial activity fetch
      enqueueUsersForSync([athleteInfo.id]);
      
      return HtmlService.createHtmlOutputFromFile('auth_success');
    } catch (e) {
      debugLog(`Error during auth callback processing: ${e.message}`, 'ERROR');
      const template = HtmlService.createTemplateFromFile('auth_error');
      template.errorMessage = e.message;
      return template.evaluate();
    }
  } else {
    const template = HtmlService.createTemplateFromFile('auth_error');
    template.errorMessage = 'Authorization was denied by Strava or the request was invalid.';
    return template.evaluate();
  }
}
