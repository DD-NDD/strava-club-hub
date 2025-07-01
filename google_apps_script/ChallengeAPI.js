// swimming_clb/ChallengeAPI.js

/**
 * @fileoverview API endpoints for challenges.
 */

/**
 * Gets all active challenges, including community progress.
 * @returns {string} A JSON string of the API response.
 */
function getActiveChallenges() {
  const cacheKey = CACHE_KEYS.ALL_CHALLENGES;
  let challenges = AppCache.get(cacheKey);
  if (challenges) {
    return JSON.stringify({ success: true, data: challenges, source: 'cache' });
  }

  try {
    const allChallenges = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGES);
    const activeChallenges = allChallenges.filter(c => c.Status === 'Active');

    const progressData = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS);

    const challengesWithProgress = activeChallenges.map(challenge => {
      if (challenge.Type === 'COMMUNITY') {
        const communityProgress = progressData.find(p => 
            String(p.ChallengeID) === String(challenge.ChallengeID) && p.UserID === '_COMMUNITY_'
        );
        return { ...challenge, CurrentProgress: communityProgress ? communityProgress.Progress : 0 };
      }
      return challenge;
    });

    AppCache.set(cacheKey, challengesWithProgress, CACHE_DURATIONS.MEDIUM);
    return JSON.stringify({ success: true, data: challengesWithProgress, source: 'sheet' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * Gets details for a single challenge, including a leaderboard of participants.
 * @param {string} challengeId The ID of the challenge.
 * @returns {string} A JSON string of the API response.
 */
function getChallengeDetails(challengeId) {
  if (!challengeId) return JSON.stringify({ success: false, error: "Challenge ID is required." });

  const cacheKey = `${CACHE_KEYS.CHALLENGE_DETAILS_PREFIX}${challengeId}`;
  let details = AppCache.get(cacheKey);
  if (details) {
    return JSON.stringify({ success: true, data: details, source: 'cache' });
  }
  
  try {
    const allMembers = DatabaseService.getAllUsers();
    const memberMap = new Map(allMembers.map(m => [String(m.id), m]));

    const allParticipants = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS);
    
    const leaderboard = allParticipants
      .filter(p => String(p.ChallengeID) === String(challengeId) && p.UserID !== '_COMMUNITY_')
      .map(p => {
        const member = memberMap.get(String(p.UserID));
        return {
          userId: p.UserID,
          name: member ? member.name : 'Unknown User',
          profile: member ? member.profile : 'https://www.gravatar.com/avatar/?d=mp',
          progress: parseFloat(p.Progress) || 0
        };
      })
      .sort((a, b) => b.progress - a.progress);

    AppCache.set(cacheKey, leaderboard, CACHE_DURATIONS.SHORT);
    return JSON.stringify({ success: true, data: leaderboard });

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * Registers a user for a challenge.
 * @param {object} payload The request payload.
 * @param {string} payload.challengeId The ID of the challenge to join.
 * @param {string} payload.userId The ID of the user joining.
 * @returns {string} A JSON string indicating success or failure.
 */
function joinChallenge(payload) {
    const { challengeId, userId } = payload;
    if (!challengeId || !userId) {
        return JSON.stringify({ success: false, error: "Challenge ID and User ID are required." });
    }
    
    // SECURITY NOTE: In a real-world scenario, the userId should be retrieved from a
    // secure session, not passed from the client, to prevent users from joining
    // on behalf of others. For this internal app, we'll proceed with the client-provided ID.

    try {
        const participantsSheet = SheetService.getDataAsObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS);
        const isAlreadyJoined = participantsSheet.some(p => 
            String(p.ChallengeID) === String(challengeId) && String(p.UserID) === String(userId)
        );

        if (isAlreadyJoined) {
            return JSON.stringify({ success: false, error: "You have already joined this challenge." });
        }
        
        const newParticipant = {
            ChallengeID: challengeId,
            UserID: userId,
            Progress: 0,
            LastUpdated: new Date()
        };

        SheetService.appendObjects(SHEET_NAMES.CHALLENGE_PARTICIPANTS, [newParticipant]);
        AppCache.remove(CACHE_KEYS.ALL_CHALLENGES); // Invalidate cache

        return JSON.stringify({ success: true, message: "Successfully joined the challenge!" });

    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
}