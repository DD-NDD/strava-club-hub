/**
 * @fileoverview This service manages all operations related to the user 'Database' sheet.
 * It acts as a Data Access Object (DAO) for user data, handling logic like
 * data structure, encoding, and specific field access. It uses SheetService for
 * the actual read/write operations.
 */

class DatabaseService {

  /**
   * Retrieves a single user's complete data object from the Database sheet.
   * @param {string|number} userId The ID of the user.
   * @return {object|null} The user data object, or null if not found.
   */
  static getUserData(userId) {
    // This is a frequent operation, so we cache the entire member list.
    const allUsers = this.getAllUsers(); 
    const normalizedUserId = String(userId).trim().split('.')[0];
    const user = allUsers.find(u => u.id === normalizedUserId);

    if (user) {
      debugLog(`(from cache) Found user data for ID: ${userId}`, 'DEBUG');
      return user;
    }
    
    debugLog(`User ID ${userId} not found.`, 'INFO');
    return null;
  }

  /**
   * Retrieves all users from the database. Implements a cache-aside pattern.
   * This now includes decoding of the USER_DATA field and robust ID normalization.
   * @return {Array<Object>} An array of all user objects.
   */
  static getAllUsers() {
    let users = AppCache.get(CACHE_KEYS.ALL_MEMBERS);
    if (users) {
      return users;
    }
    
    debugLog("Cache miss for members. Fetching from Sheet.", "INFO");
    const rawUsers = SheetService.getDataAsObjects(SHEET_NAMES.DATABASE);
    users = rawUsers.map(row => {
      try {
        if (!row.ID) return null; // Skip rows without an ID
        
        const encodedString = row.USER_DATA || '';
        const decodedString = decodeData(encodedString); // Decode the data first
        const userData = JSON.parse(decodedString || '{}'); // Parse the decoded JSON
        return {
          // Robust normalization: Convert to string, trim whitespace, and remove decimal part.
          id: String(row.ID).trim().split('.')[0], 
          name: row.NAME,
          lastUpdated: row.LAST_UPDATED,
          ...userData // Spread the parsed user data
        };
      } catch (e) {
        debugLog(`Failed to parse USER_DATA for user ID ${row.ID}: ${e.message}`, 'ERROR');
        return null;
      }
    }).filter(Boolean); // Filter out any nulls from parsing errors or missing IDs
    
    AppCache.set(CACHE_KEYS.ALL_MEMBERS, users, CACHE_DURATIONS.SUPPER_LONG);
    return users;
  }

  /**
   * Updates or creates a user's record in the Database sheet.
   * This now includes encoding the user data before writing.
   * @param {string|number} userId The ID of the user.
   * @param {object} userData The full user data object to save.
   * @return {boolean} True on success, false on failure.
   */
  static updateUserData(userId, userData) {
    try {
      const dataToStore = { ...userData }; // Create a clone

      // Separate core columns from the JSON blob
      const fullName = `${dataToStore.firstname || ''} ${dataToStore.lastname || ''}`.trim();
      const now = new Date();

      // These properties will be stored in dedicated columns, not in the JSON blob.
      delete dataToStore.id;
      delete dataToStore.name;
      delete dataToStore.lastUpdated;

      const userDataStr = JSON.stringify(dataToStore);
      const encodedUserData = encodeData(userDataStr); // Encode the JSON string

      const userRecord = {
        ID: userId,
        NAME: fullName,
        USER_DATA: encodedUserData, // Store the encoded data
        LAST_UPDATED: now
      };

      // Check if user exists to decide between update and append
      const allUsers = SheetService.getDataAsObjects(SHEET_NAMES.DATABASE);
      const existingUser = allUsers.find(u => String(u.ID).trim().split('.')[0] === String(userId).trim().split('.')[0]);
      
      let result;
      if (existingUser) {
        debugLog(`Updating existing user ID: ${userId}`, 'DEBUG');
        result = SheetService.updateObjectById(SHEET_NAMES.DATABASE, userId, userRecord, 'ID');
      } else {
        debugLog(`Appending new user ID: ${userId}`, 'DEBUG');
        result = SheetService.appendObjects(SHEET_NAMES.DATABASE, [userRecord]);
      }
      
      if (result.success) {
        // Invalidate member cache after updating
        AppCache.remove(CACHE_KEYS.ALL_MEMBERS);
        debugLog(`Successfully updated data for user ${userId} and invalidated cache.`, 'INFO');
        return true;
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      debugLog(`Error in DatabaseService.updateUserData: ${error.message}`, 'ERROR');
      return false;
    }
  }

  /**
   * A convenience method to get a user's access token.
   * @param {string|number} userId The ID of the user.
   * @return {string|null} The access token.
   */
  static getAccessToken(userId) {
    const user = this.getUserData(userId);
    return user ? user.accessToken : null;
  }

  /**
   * A convenience method to get a user's refresh token.
   * @param {string|number} userId The ID of the user.
   * @return {string|null} The refresh token.
   */
  static getRefreshToken(userId) {
    const user = this.getUserData(userId);
    return user ? user.refreshToken : null;
  }
}
