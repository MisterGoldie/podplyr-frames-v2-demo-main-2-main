// Central export file for Firebase functionality

// Export from config module
export { db, auth, storage, firebaseLogger } from './config';

// Export from utils module
export { delay, fetchWithRetry } from './utils';

// Export from user module
export { 
  cacheUserWallet,
  getCachedWallet,
  searchUsers
} from './user';

// Export from plays module
export {
  trackNFTPlay,
  getTopPlayedNFTs,
  hasBeenTopPlayed,
  subscribeToRecentPlays
} from './plays';

// Export from likes module
export {
  cleanupLikes,
  getLikedNFTs,
  toggleLikeNFT,
  addLikedNFT,
  removeLikedNFT
} from './likes';
