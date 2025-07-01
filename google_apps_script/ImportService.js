/**
 * @fileoverview This service handles the import of Strava activities
 * from external URLs or uploaded HTML files. It does not require user
 * authentication as it parses publicly accessible activity pages.
 */

class ImportService {

    /**
     * Downloads the HTML content of a given URL.
     * @param {string} url The URL to download.
     * @return {string|null} The HTML content as a string, or null on error.
     * @private
     */
    static _downloadActivityPage(url) {
        debugLog(`_downloadActivityPage: Downloading ${url}`, 'DEBUG');
        try {
            const options = {
                muteHttpExceptions: true, // Don't throw exceptions for 4xx/5xx errors
            };
            const response = UrlFetchApp.fetch(url, options);

            if (response.getResponseCode() === 200) {
                debugLog('_downloadActivityPage: Download successful.', 'DEBUG');
                return response.getContentText();
            } else {
                debugLog(`_downloadActivityPage: Download failed. Status code: ${response.getResponseCode()}`, 'ERROR');
                return null;
            }
        } catch (error) {
            debugLog(`_downloadActivityPage: Error: ${error.message}`, 'ERROR');
            return null;
        }
    }

    /**
     * Parses the activity page HTML and extracts activity details from the __NEXT_DATA__ script tag.
     * @param {string} htmlContent The HTML content of the activity page.
     * @return {object|null} An object containing activity details, or null on error.
     * @private
     */
    static _parseActivityPage(htmlContent) {
        debugLog('_parseActivityPage: Starting...', 'DEBUG');
        try {
            const $ = Cheerio.load(htmlContent);
            const scriptTag = $('#__NEXT_DATA__');

            if (!scriptTag || scriptTag.length === 0) {
                debugLog('_parseActivityPage: JSON __NEXT_DATA__ not found.', 'WARNING');
                return null;
            }

            const data = JSON.parse(scriptTag.html());
            const activity = data?.props?.pageProps?.activity;

            if (!activity) {
                debugLog('_parseActivityPage: Activity info not found in JSON.', 'WARNING');
                return null;
            }
            
            const details = {
              athlete_id: activity.athlete?.id,
              id: activity.id,
              name: activity.name,
              type: activity.activityKind?.sportType,
              distance: activity.scalars?.distance,
              moving_time: activity.scalars?.movingTime,
              start_date: activity.startLocal,
            };
            
            debugLog(`_parseActivityPage: Parsed activity: ${JSON.stringify(details)}`, 'DEBUG');
            return details;

        } catch (error) {
            debugLog(`_parseActivityPage: Error parsing HTML: ${error.message}`, 'ERROR');
            return null;
        }
    }

    /**
     * Extracts unique Strava activity links from HTML content.
     * @param {string} htmlContent The HTML content to search.
     * @return {Array<string>} An array of unique Strava activity URLs.
     * @private
     */
    static _extractUniqueStravaLinks(htmlContent) {
        debugLog('_extractUniqueStravaLinks: Starting...', 'DEBUG');
        const pattern = /https:\/\/www\.strava\.com\/activities\/\d+/g;
        const links = htmlContent.match(pattern) || [];
        const uniqueLinks = [...new Set(links)];
        debugLog(`_extractUniqueStravaLinks: Found ${uniqueLinks.length} unique links.`, 'DEBUG');
        return uniqueLinks;
    }

    /**
     * Processes a list of activity URLs, imports them, and writes to the sheet.
     * @param {Array<object>} activitiesPayload - An array of objects, e.g., [{url: '...'}, {url: '...'}]
     * @return {object} A result object.
     */
    static processStravaLinks(activitiesPayload) {
        debugLog(`processStravaLinks: Received ${activitiesPayload.length} links to process.`, 'INFO');
        const importedActivities = [];
        const failedLinks = [];

        try {
            for (const activity of activitiesPayload) {
                const url = activity.url;
                if (!url) continue;

                const pageHtml = this._downloadActivityPage(url);
                if (pageHtml) {
                    const details = this._parseActivityPage(pageHtml);
                    if (details) {
                        importedActivities.push(details);
                    } else {
                        failedLinks.push(url);
                        debugLog(`Failed to parse activity details for ${url}`, 'WARNING');
                    }
                } else {
                    failedLinks.push(url);
                    debugLog(`Failed to download activity page for ${url}`, 'WARNING');
                }
            }

            if (importedActivities.length > 0) {
                SheetService.appendObjects(SHEET_NAMES.ACTIVITIES, importedActivities);
                AppCache.invalidateActivityCaches(); // Invalidate cache to show new data
            }
            
            return {
                success: true,
                message: `Successfully imported ${importedActivities.length} activities. Failed: ${failedLinks.length}.`,
                activitiesCount: importedActivities.length
            };

        } catch (error) {
            debugLog(`processStravaLinks: Critical error: ${error.message}`, 'ERROR');
            return {
                success: false,
                message: `Error: ${error.message}`,
                activitiesCount: 0
            };
        }
    }

    /**
     * Processes an uploaded HTML file content, extracts links, and imports activities.
     * @param {string} fileContent The content of the uploaded HTML file.
     * @return {object} A result object.
     */
    static processUploadedHtml(fileContent) {
        debugLog('processUploadedHtml: Starting import from file.', 'INFO');
        try {
            if (!fileContent) {
                return { success: false, message: 'Error: File content is empty.', activitiesCount: 0 };
            }

            const links = this._extractUniqueStravaLinks(fileContent);
            if (links.length === 0) {
                return { success: false, message: 'No Strava activity links found in the file.', activitiesCount: 0 };
            }
            
            // Re-use the link processing logic
            const payload = links.map(url => ({ url }));
            return this.processStravaLinks(payload);

        } catch (error) {
            debugLog(`processUploadedHtml: Critical error: ${error.message}`, 'ERROR');
            return {
                success: false,
                message: `Error: ${error.message}`,
                activitiesCount: 0
            };
        }
    }
}