/**
 * @fileoverview API endpoints for retrieving activity data.
 */

function getRecentActivities() {
  const cacheKey = CACHE_KEYS.RECENT_ACTIVITIES_FEED;
  let recentActivities = AppCache.get(cacheKey);
  if (recentActivities) {
    return JSON.stringify({ success: true, data: recentActivities, source: 'cache' });
  }
  
  try {
    const allActivities = SheetService.getDataAsObjects(SHEET_NAMES.ACTIVITIES_RECENT);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    recentActivities = allActivities
      .filter(activity => activity.start_date && new Date(activity.start_date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date)) // Sort descending
      .slice(0, 50); // Limit to the most recent 50
    
    AppCache.set(cacheKey, recentActivities, CACHE_DURATIONS.SHORT);
    return JSON.stringify({ success: true, data: recentActivities, source: 'sheet' });

  } catch(e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}
