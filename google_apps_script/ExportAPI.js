/**
 * @fileoverview Exposes API endpoints for exporting data.
 */

/**
 * An API endpoint callable from the client to generate and return a file for download.
 * @param {object} payload - An object containing export options.
 * @param {string} payload.period - The leaderboard period.
 * @param {string} payload.format - The desired format ('csv' or 'html').
 * @return {object} A result object with file content, MIME type, and filename.
 */
function exportLeaderboard(payload) {
  try {
    if (!payload || !payload.period || !payload.format) {
      throw new Error("Period and format must be provided for export.");
    }
    
    // Use the new service to generate the export data
    const fileData = ExportService.generateLeaderboardExport(payload.period, payload.format);
    
    return { success: true, ...fileData };

  } catch (e) {
    return { success: false, error: e.message };
  }
}