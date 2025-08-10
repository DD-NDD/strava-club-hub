/**
 * @fileoverview A central place for all project constants to avoid magic strings.
 * This makes configuration and maintenance much easier.
 */

// A flag to enable or disable detailed logging. Set to false in production.
const DEBUG_MODE = true;

// An enumeration of all sheet names used in the project.
const SHEET_NAMES = {
  DATABASE: 'Database',
  ACTIVITIES: 'Activities',
  ACTIVITIES_RECENT: 'ActivitiesRecent',
  ACTIVITIES_THIS_MONTH: 'ActivitiesThisMonth',
  ACTIVITIES_LAST_MONTH: 'ActivitiesLastMonth',
  LEADERBOARD_TOP3: 'LeaderboardTop3',
  POOLS: 'Pools',
  EVENTS: 'Events',
  POSTS: 'Posts',
  REGISTRATIONS: 'Registrations',
  CHALLENGES: 'Challenges',
  CHALLENGE_PARTICIPANTS: 'ChallengeParticipants',
  DEBUG_LOGS: 'DebugLogs'
};

// An enumeration for column indices in the "Database" sheet for reliable access.
const DB_COLUMNS = {
  ID: 1,
  NAME: 2,
  USER_DATA: 3,
  LAST_UPDATED: 4
};

// An enumeration for all cache keys.
const CACHE_KEYS = {
  // Data caches
  ALL_MEMBERS: 'v2_all_members',
  ALL_POOLS: 'v2_all_pools',
  ALL_EVENTS: 'v2_all_events',
  ALL_POSTS: 'v2_all_posts',

  // Leaderboard caches
  LEADERBOARD_THIS_MONTH: 'v2_leaderboard_this_month',
  LEADERBOARD_LAST_MONTH: 'v2_leaderboard_last_month',
  LEADERBOARD_CHALLENGE: 'v2_leaderboard_challenge',
  TOP_THREE_THIS_MONTH: 'v2_top_three_this_month',
  
  // Recent activity feed cache
  RECENT_ACTIVITIES_FEED: 'v2_recent_activities_feed',
  ALL_CHALLENGES: 'v2_all_challenges',
  CHALLENGE_DETAILS_PREFIX: 'v2_challenge_details_' // Note: This is a prefix
};

// Standard cache durations in seconds.
const CACHE_DURATIONS = {
  SHORT: 300,         // 5 minutes
  MEDIUM: 3600,       // 1 hour
  LONG: 21600,        // 6 hours
  VERY_LONG: 86400,   // 24 hours
  SUPPER_LONG: 604800 // 7 days
};

// Constants for background activity processing queue.
const ACTIVITY_QUEUE = {
  QUEUE_KEY: 'userActivityQueue',
  LOCK_KEY: 'userActivityQueueLock',
  MAX_USERS_PER_RUN: 5,
  UPDATE_INTERVAL_HOURS: 4
};

/**
 * @description Settings related to the Strava integration.
 */
const STRAVA_SETTINGS = {
  /**
   * @description An array of activity types to sync from Strava.
   * Only activities matching these types will be saved.
   * Find possible values at: https://developers.strava.com/docs/reference/#api-models-ActivityType
   * @type {Array<string>}
   */
  ALLOWED_ACTIVITY_TYPES: ['Swim'],

  /**
   * @description An array of allowed visibility settings for activities to be synced.
   * Strava's possible values are: 'everyone', 'followers_only', 'only_me'.
   * @type {Array<string>}
   */
  ALLOWED_VISIBILITY: ['everyone', 'followers_only']
};

const PROPERTY_KEYS = {
  LAST_WEBHOOK_TIMESTAMP: 'LAST_WEBHOOK_TIMESTAMP'
};
