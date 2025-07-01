/**
 * @fileoverview This service handles the logic for generating export files
 * like CSV and HTML based on application data.
 * v2: Adds detailed activities for each member in the export.
 * v3: Flattens CSV export and adds total time calculation.
 * v4: Adds Rank column to CSV export.
 */
class ExportService {

  /**
   * Generates a leaderboard export file in the specified format.
   * Now includes detailed activity lists for each member.
   * @param {string} period - The leaderboard period (e.g., 'this_month').
   * @param {string} format - The desired format ('csv' or 'html').
   * @return {object} An object containing the file content, MIME type, and filename.
   */
  static generateLeaderboardExport(period, format) {
    // 1. Fetch the aggregated leaderboard data
    const leaderboardJSON = getLeaderboardData(period);
    const leaderboardResult = JSON.parse(leaderboardJSON);

    if (!leaderboardResult.success) {
      throw new Error("Could not fetch leaderboard data to export.");
    }
    const leaderboardData = leaderboardResult.data || [];

    // 2. Define date range based on the period
    const now = new Date();
    let startDate, endDate;
    switch (period) {
        case 'last_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
        case 'challenge':
            // These dates should be configured elsewhere, but are here for now
            startDate = new Date('2025-06-01T00:00:00+07:00');
            endDate = new Date('2025-06-20T23:59:59+07:00');
            break;
        default: // 'this_month'
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // 3. Fetch ALL activities and filter them for the period (Required for HTML export)
    const allActivities = SheetService.getDataAsObjects(SHEET_NAMES.ACTIVITIES);
    const periodActivities = allActivities.filter(activity => {
      const activityDate = new Date(activity.start_date); 
      return activityDate >= startDate && activityDate <= endDate;
    });

    // 4. Group activities by athlete ID (Required for HTML export)
    const activitiesByUser = periodActivities.reduce((acc, activity) => {
        const userId = String(activity.athlete_id);
        if (!acc[userId]) {
            acc[userId] = [];
        }
        acc[userId].push(activity);
        return acc;
    }, {});
    
    // 5. Generate summary data (Required for HTML export)
    const summary = this._generateSummaryData(leaderboardData);
    
    // 6. Generate content based on the requested format
    const timestamp = Utilities.formatDate(now, "GMT", "yyyyMMdd_HHmmss");
    
    if (format === 'csv') {
      return {
        content: this._generateCsvContent(leaderboardData), // Pass only leaderboardData
        mimeType: 'text/csv',
        fileName: `leaderboard_${period}_${timestamp}.csv`
      };
    } else if (format === 'html') {
      return {
        content: this._generateHtmlContent(summary, leaderboardData, activitiesByUser, period),
        mimeType: 'text/html',
        fileName: `leaderboard_${period}_${timestamp}.html`
      };
    } else {
      throw new Error("Unsupported export format requested.");
    }
  }

  /**
   * Private helper to calculate summary statistics from leaderboard data.
   * (This function is unchanged)
   */
  static _generateSummaryData(leaderboardData) {
    const totalDistance = leaderboardData.reduce((sum, member) => sum + (member.total_distance || 0), 0);
    const totalActivities = leaderboardData.reduce((sum, member) => sum + (member.activity_count || 0), 0);
    return {
      totalSwimmers: leaderboardData.length,
      totalDistanceMeters: totalDistance,
      totalActivities: totalActivities
    };
  }
  
  /**
   * Private helper to format seconds into HH:MM:SS format.
   * @param {number} totalSeconds The total seconds to format.
   * @return {string} The formatted time string.
   * @private
   */
  static _formatSecondsToHms(totalSeconds) {
      if (isNaN(totalSeconds) || totalSeconds < 0) {
          return "00:00:00";
      }
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);

      const pad = (num) => String(num).padStart(2, '0');

      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }


  /**
   * Private helper to generate the content for a CSV file.
   * This version creates a flat file with aggregated data per member.
   * @param {Array<Object>} leaderboardData - The aggregated leaderboard data.
   * @returns {string} The CSV content as a string.
   */
  static _generateCsvContent(leaderboardData) {
    const toCsvSafe = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
    let csv = [];
    
    const headers = [
        "Rank", // Added Rank column
        "Member Name",
        "Member ID",
        "Total Activities",
        "Total Distance (km)",
        "Total Time (HH:MM:SS)"
    ];
    csv.push(headers.join(','));

    // leaderboardData is already sorted, so we can use the index for the rank
    leaderboardData.forEach((member, index) => {
      const rowData = [
        index + 1, // Add the rank
        toCsvSafe(member.athlete_name),
        toCsvSafe(member.athlete_id),
        member.activity_count || 0,
        (member.total_distance / 1000).toFixed(2),
        this._formatSecondsToHms(member.total_moving_time || 0)
      ];
      csv.push(rowData.join(','));
    });

    return csv.join('\n');
  }


  /**
   * Private helper to generate the content for an HTML file with activity details.
   * (This function is unchanged)
   */
  static _generateHtmlContent(summary, leaderboardData, activitiesByUser, period) {
    const periodTitle = period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    let memberDetailsHtml = '';
    leaderboardData.forEach((member, index) => {
      const memberActivities = activitiesByUser[String(member.athlete_id)] || [];
      let activityRows = '<tr><td colspan="4">No activities recorded in this period.</td></tr>';

      if (memberActivities.length > 0) {
        activityRows = memberActivities.map(activity => {
          const activityDate = Utilities.formatDate(new Date(activity.start_date), "GMT+7", "yyyy-MM-dd HH:mm");
          const distanceKm = (activity.distance / 1000).toFixed(2);
          return `
            <tr>
              <td>${activityDate}</td>
              <td><a href="https://www.strava.com/activities/${activity.id}" target="_blank">${activity.name}</a></td>
              <td>${distanceKm} km</td>
            </tr>
          `;
        }).join('');
      }

      memberDetailsHtml += `
        <details class="member-card">
          <summary>
            <span class="rank">${index + 1}</span>
            <div class="summary-details">
              <span class="name">${member.athlete_name}</span>
              <span class="meta">ID: ${member.athlete_id}</span>
            </div>
            <div class="summary-stats">
              <span>${(member.total_distance / 1000).toFixed(2)} km</span>
              <small>${member.activity_count || 0} Activities</small>
            </div>
          </summary>
          <div class="activity-table-container">
            <table>
              <thead>
                <tr><th>Date</th><th>Activity Name</th><th>Distance</th></tr>
              </thead>
              <tbody>${activityRows}</tbody>
            </table>
          </div>
        </details>
      `;
    });

    return `
      <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
      <title>Leaderboard Report: ${periodTitle}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:1.5em;background-color:#fcfcfc;color:#333}
        h1,h2{color:#111;border-bottom:1px solid #ddd;padding-bottom:10px}
        .summary-box{background-color:#e9f5ff;border-left:5px solid #1a73e8;padding:1px 15px;margin:20px 0}
        .member-card{border:1px solid #ddd;border-radius:8px;margin-bottom:10px;background:#fff}
        .member-card[open] summary{border-bottom:1px solid #ddd}
        summary{display:flex;align-items:center;padding:15px;cursor:pointer;list-style:none}
        summary::-webkit-details-marker{display:none}
        .rank{font-size:1.2em;font-weight:bold;color:#555;margin-right:15px;min-width:25px;text-align:center}
        .summary-details{flex-grow:1}
        .name{font-weight:600;font-size:1.1em;display:block}
        .meta{font-size:0.8em;color:#777}
        .summary-stats{text-align:right}
        .summary-stats span{font-size:1.2em;font-weight:bold;color:#1a73e8}
        .summary-stats small{display:block;font-size:0.8em;color:#777}
        .activity-table-container{padding:0 15px 15px 15px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border-top:1px solid #eee;padding:10px;text-align:left}
        th{font-weight:600;font-size:0.9em;color:#555}
        tbody tr:hover{background-color:#f7f7f7}
        a{color:#1a73e8;text-decoration:none}
        a:hover{text-decoration:underline}
      </style>
      </head><body>
      <h1>Leaderboard Report</h1><h2>Period: ${periodTitle}</h2>
      <div class="summary-box"><h3>Summary</h3>
        <p><strong>Total Active Swimmers:</strong> ${summary.totalSwimmers}</p>
        <p><strong>Total Club Distance:</strong> ${(summary.totalDistanceMeters / 1000).toFixed(2)} km</p>
        <p><strong>Total Club Activities:</strong> ${summary.totalActivities}</p>
      </div>
      <h2>Member Details</h2><div class="member-list">${memberDetailsHtml}</div>
      </body></html>
    `;
  }
}