/**
 * @fileoverview This service provides a robust caching layer for the application.
 * It encapsulates Google's CacheService and adds features like automatic GZIP
 * compression for large values to overcome the 100KB size limit.
 */

class AppCacheManager {
  /**
   * Constructor for the AppCacheManager.
   * Initializes script-level cache.
   */
  constructor() {
    this.cache = CacheService.getScriptCache();
    this.COMPRESSION_THRESHOLD = 90 * 1024; // 90KB, below the 100KB limit
    this.COMPRESSION_PREFIX = 'GZIPPED::';
  }

  /**
   * Retrieves an item from the cache, decompressing it if necessary.
   * @param {string} key The key of the item to retrieve.
   * @return {any|null} The cached data, or null if not found or expired.
   */
  get(key) {
    try {
      let cachedValue = this.cache.get(key);
      if (cachedValue) {
        // Check if the value is compressed
        if (cachedValue.startsWith(this.COMPRESSION_PREFIX)) {
          debugLog(`Decompressing cached value for key: ${key}`, 'DEBUG');
          const base64Data = cachedValue.substring(this.COMPRESSION_PREFIX.length);
          const bytes = Utilities.base64Decode(base64Data, Utilities.Charset.UTF_8);
          const blob = Utilities.newBlob(bytes, 'application/x-gzip');
          const decompressedBlob = Utilities.ungzip(blob);
          cachedValue = decompressedBlob.getDataAsString();
        }
        
        debugLog(`Cache HIT for key: ${key}`, "DEBUG");
        return JSON.parse(cachedValue);
      }
      debugLog(`Cache MISS for key: ${key}`, "DEBUG");
      return null;
    } catch (e) {
      debugLog(`Error getting cache for key ${key}: ${e.message}`, "ERROR");
      this.remove(key); // Remove corrupted cache entry
      return null;
    }
  }

  /**
   * Puts an item into the cache, compressing it first if it's too large.
   * @param {string} key The key for the item.
   * @param {any} value The data to cache. Must be JSON-serializable.
   * @param {number} durationSeconds The duration in seconds to cache the item.
   */
  set(key, value, durationSeconds) {
    try {
      let stringValue = JSON.stringify(value);

      // Check if the string value exceeds our threshold
      if (stringValue.length > this.COMPRESSION_THRESHOLD) {
        debugLog(`Value for key ${key} is large (${stringValue.length} bytes). Compressing...`, 'DEBUG');
        const blob = Utilities.newBlob(stringValue, 'application/json');
        const gzippedBlob = Utilities.gzip(blob);
        const bytes = gzippedBlob.getBytes();
        // Prepend with prefix to identify it as compressed during get()
        stringValue = this.COMPRESSION_PREFIX + Utilities.base64Encode(bytes, Utilities.Charset.UTF_8);
      }
      
      this.cache.put(key, stringValue, durationSeconds);
      debugLog(`Cache SET for key: ${key}, size: ${stringValue.length} bytes`, "DEBUG");
    } catch (e) {
      debugLog(`Error setting cache for key ${key}: ${e.message}`, "ERROR");
    }
  }

  /**
   * Removes a specific item from the cache.
   * @param {string} key The key of the item to remove.
   */
  remove(key) {
    this.cache.remove(key);
    debugLog(`Cache REMOVED for key: ${key}`, "DEBUG");
  }

  /**
   * Removes multiple items from the cache.
   * @param {Array<string>} keys An array of keys to remove.
   */
  removeAll(keys) {
    this.cache.removeAll(keys);
    debugLog(`Cache REMOVED for keys: ${keys.join(', ')}`, "DEBUG");
  }

  /**
   * Invalidates all caches related to activities and leaderboards.
   * Should be called whenever new activities are added.
   */
  invalidateActivityCaches() {
    const keysToInvalidate = [
      CACHE_KEYS.RECENT_ACTIVITIES_FEED,
      CACHE_KEYS.LEADERBOARD_THIS_MONTH,
      CACHE_KEYS.LEADERBOARD_LAST_MONTH,
      CACHE_KEYS.LEADERBOARD_CHALLENGE,
      CACHE_KEYS.TOP_THREE_THIS_MONTH
    ];
    this.removeAll(keysToInvalidate);
    debugLog("All activity-related caches have been invalidated.", "INFO");
  }
}

// Create a global instance using the new class name to be used throughout the app.
const AppCache = new AppCacheManager();
