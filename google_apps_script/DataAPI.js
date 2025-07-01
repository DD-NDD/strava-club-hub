/**
 * @fileoverview This file contains generic data-fetching API endpoints
 * that the client-side UI can call.
 */

/**
 * A generic function to get all data from a sheet and cache it.
 * @param {string} sheetName The name of the sheet from SHEET_NAMES constant.
 * @param {string} cacheKey The cache key from CACHE_KEYS constant.
 * @param {number} cacheDuration The cache duration from CACHE_DURATIONS constant.
 * @return {string} A JSON string of the API response.
 */
function getAPIData(sheetName, cacheKey, cacheDuration) {
  let data = AppCache.get(cacheKey);
  if (data) {
    return JSON.stringify({ success: true, data: data, source: 'cache' });
  }

  try {
    data = SheetService.getDataAsObjects(sheetName);
    AppCache.set(cacheKey, data, cacheDuration);
    return JSON.stringify({ success: true, data: data, source: 'sheet' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

function getAllPools() {
  return getAPIData(SHEET_NAMES.POOLS, CACHE_KEYS.ALL_POOLS, CACHE_DURATIONS.LONG);
}

function getAllPosts() {
  return getAPIData(SHEET_NAMES.POSTS, CACHE_KEYS.ALL_POSTS, CACHE_DURATIONS.LONG);
}

/**
 * Gets the full Markdown content for a single post from its linked Google Doc.
 * @param {string|number} postId The ID of the post.
 * @return {string} A JSON string of the API response.
 */
function getPostContent(postId) {
  try {
    if (!postId) {
      throw new Error("Post ID is required.");
    }

    const allPosts = SheetService.getDataAsObjects(SHEET_NAMES.POSTS);
    const post = allPosts.find(p => String(p.ID) === String(postId));

    if (!post) {
      throw new Error(`Post with ID ${postId} not found.`);
    }
    if (!post.DocID) {
      throw new Error(`The post "${post.Title}" does not have a Google Doc ID linked to it.`);
    }

    // Open the Google Doc and get its content as plain text.
    // We assume the content is written in Markdown format.
    const doc = DocumentApp.openById(post.DocID);
    const body = doc.getBody();
    const markdownContent = body.getText();

    return JSON.stringify({ success: true, data: markdownContent });

  } catch (e) {
    debugLog(`Error in getPostContent: ${e.message}`, 'ERROR');
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * Gets active events and enriches them with registration counts.
 * Caching is more complex here due to the dynamic counts.
 * @return {string} A JSON string of the API response.
 */
function getActiveEvents() {
  const cacheKey = CACHE_KEYS.ALL_EVENTS;
  let activeEvents = AppCache.get(cacheKey);

  if (activeEvents) {
    return JSON.stringify({ success: true, data: activeEvents, source: 'cache' });
  }

  try {
    const allEvents = SheetService.getDataAsObjects(SHEET_NAMES.EVENTS);
    const allRegistrations = SheetService.getDataAsObjects(SHEET_NAMES.REGISTRATIONS);
    
    const registrationCounts = allRegistrations.reduce((acc, reg) => {
      const eventId = reg.EventID;
      if (!acc[eventId]) {
        acc[eventId] = { online: 0, offline: 0, challenge: 0, total: 0 };
      }
      if (reg.ParticipationType === 'Online') acc[eventId].online++;
      if (reg.ParticipationType === 'Offline') acc[eventId].offline++;
      if (reg.ParticipationType === 'Challenge') acc[eventId].challenge++;
      acc[eventId].total++;
      return acc;
    }, {});

    activeEvents = allEvents
      .filter(event => event.Status === 'Active')
      .map(event => ({
        ...event,
        RegistrationCounts: registrationCounts[event.ID] || { online: 0, offline: 0, challenge: 0, total: 0 }
      }));
    
    AppCache.set(cacheKey, activeEvents, CACHE_DURATIONS.SHORT); // Short cache due to changing registrations
    return JSON.stringify({ success: true, data: activeEvents, source: 'sheet' });

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}