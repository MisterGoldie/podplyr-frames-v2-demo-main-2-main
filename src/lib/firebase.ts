import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove,
  doc,
  increment,
  onSnapshot,
  setDoc,
  getDoc,
  deleteDoc,
  documentId,
  serverTimestamp,
  writeBatch,
  DocumentSnapshot
} from 'firebase/firestore';
import type { NFT, FarcasterUser, SearchedUser, NFTPlayData } from '../types/user';
import { fetchUserNFTsFromAlchemy } from './alchemy';
import { getMediaKey } from '~/utils/media';

// Initialize Firebase with your config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export { app };
export const db = getFirestore(app);

// Cache user's wallet address
export const cacheUserWallet = async (fid: number, address: string): Promise<void> => {
  try {
    const cacheRef = doc(db, 'wallet_cache', fid.toString());
    await setDoc(cacheRef, {
      address,
      timestamp: serverTimestamp()
    });
    console.log('Cached wallet address for FID:', fid, address);
  } catch (error) {
    console.error('Error caching wallet:', error);
  }
};

// Get cached wallet address
export const getCachedWallet = async (fid: number): Promise<string | null> => {
  try {
    const cacheRef = doc(db, 'wallet_cache', fid.toString());
    const cacheDoc = await getDoc(cacheRef);
    if (cacheDoc.exists()) {
      return cacheDoc.data().address;
    }
    return null;
  } catch (error) {
    console.error('Error getting cached wallet:', error);
    return null;
  }
};

// Track user search and return Farcaster user data
export const trackUserSearch = async (username: string, fid: number): Promise<FarcasterUser> => {
  try {
    const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!neynarKey) throw new Error('Neynar API key not found');

    console.log('Searching for user:', username);
    // First search for the user to get their FID
    const searchResponse = await fetchWithRetry(
      `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(username)}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': neynarKey
        }
      }
    );

    const searchData = await searchResponse.json();
    console.log('Search response:', searchData);
    const searchedUser = searchData.result?.users[0];
    if (!searchedUser) throw new Error('User not found');

    console.log('Found user, fetching full profile for FID:', searchedUser.fid);
    // Then fetch their full profile data including verified addresses
    const profileResponse = await fetchWithRetry(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${searchedUser.fid}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': neynarKey
        }
      }
    );

    const profileData = await profileResponse.json();
    console.log('Profile response:', profileData);
    const user = profileData.users?.[0];
    if (!user) throw new Error('User profile not found');

    // Extract addresses from user profile data
    const addresses = new Set<string>();
    
    // Try to get custody address from user profile
    if (user.custody_address) {
      console.log('Found custody address in profile:', user.custody_address);
      addresses.add(user.custody_address);
    }
    
    // Try to get verified addresses from user profile
    if (user.verified_addresses) {
      if (Array.isArray(user.verified_addresses)) {
        console.log('Found verified addresses (array):', user.verified_addresses);
        user.verified_addresses.forEach((addr: string) => addresses.add(addr));
      } else if (user.verified_addresses.eth_addresses) {
        console.log('Found verified addresses (object):', user.verified_addresses.eth_addresses);
        user.verified_addresses.eth_addresses.forEach((addr: string) => addresses.add(addr));
      }
    }

    // Try to get additional addresses from v1 API endpoints if needed
    if (addresses.size === 0) {
      try {
        // Try custody address endpoint
        const custodyResponse = await fetchWithRetry(
          `https://api.neynar.com/v2/farcaster/user/custody-address?fid=${searchedUser.fid}`,
          {
            headers: {
              'accept': 'application/json',
              'api_key': neynarKey
            }
          }
        );

        const custodyData = await custodyResponse.json();
        if (custodyData.result?.custody_address) {
          console.log('Found custody address from v2 API:', custodyData.result.custody_address);
          addresses.add(custodyData.result.custody_address);
        }
      } catch (error) {
        console.warn('Failed to fetch custody address:', error);
      }

      try {
        // Try verified addresses endpoint
        const verifiedResponse = await fetchWithRetry(
          `https://api.neynar.com/v2/farcaster/user/verified-addresses?fid=${searchedUser.fid}`,
          {
            headers: {
              'accept': 'application/json',
              'api_key': neynarKey
            }
          }
        );

        const verifiedData = await verifiedResponse.json();
        const verifiedAddresses = verifiedData.result?.verified_addresses || [];
        if (verifiedAddresses.length > 0) {
          console.log('Found verified addresses from v2 API:', verifiedAddresses);
          verifiedAddresses.forEach((addr: string) => addresses.add(addr));
        }
      } catch (error) {
        console.warn('Failed to fetch verified addresses:', error);
      }
    }

    // Convert to array
    const finalAddresses = Array.from(addresses);
    console.log('Final addresses:', finalAddresses);

    // Update searchedusers collection with user data and search info
    const now = new Date().getTime();
    const searchedUserRef = doc(db, 'searchedusers', user.fid.toString());
    const searchedUserData = {
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      custody_address: finalAddresses[0] || null,
      verifiedAddresses: finalAddresses,
      follower_count: user.follower_count,
      following_count: user.following_count,
      lastSearched: now,
      searchCount: increment(1)
    };
    await setDoc(searchedUserRef, searchedUserData, { merge: true });

    // Cache the first available address for NFT retrieval
    if (finalAddresses.length > 0) {
      await cacheUserWallet(user.fid, finalAddresses[0]);
    }
    
    // Also track in user_searches for history
    console.log('=== TRACKING USER SEARCH ===');
    console.log('FID:', fid);
    console.log('Searched User:', user);
    
    const searchRef = collection(db, 'user_searches');
    const timestamp = Date.now();
    console.log('Using timestamp:', new Date(timestamp));
    
    // Create the search record using unified index pattern
    const searchRecord = {
      searching_fid: fid, // Changed from fid to match index
      searchedFid: user.fid,
      searchedUsername: user.username,
      searchedDisplayName: user.display_name,
      searchedPfpUrl: user.pfp_url,
      searchedFollowerCount: user.follower_count,
      searchedFollowingCount: user.following_count,
      timestamp: timestamp, // Use client timestamp for immediate ordering
      serverTimestamp: serverTimestamp() // Keep server timestamp for consistency
    };
    
    console.log('Adding search with data:', searchRecord);
    await addDoc(searchRef, searchRecord);
    console.log('Search tracked successfully');

    return {
      ...user,
      custody_address: finalAddresses[0] || null,
      verifiedAddresses: finalAddresses
    };
  } catch (error) {
    console.error('Error tracking user search:', error);
    throw error;
  }
};

// Get recent searches with optional FID filter
// Subscribe to recent searches
export const subscribeToRecentSearches = (fid: number, callback: (searches: SearchedUser[]) => void) => {
  const searchesRef = collection(db, 'user_searches');
  // Use unified index pattern for recent searches
  const q = query(
    searchesRef,
    where('searching_fid', '==', fid),
    orderBy('timestamp', 'desc'),
    limit(20)
  );

  console.log('=== SUBSCRIBING TO RECENT SEARCHES ===');
  console.log('FID:', fid);
  
  console.log('Setting up snapshot listener with query:', {
    fid,
    orderBy: 'timestamp',
    direction: 'desc',
    limit: 20
  });

  return onSnapshot(q, (snapshot) => {
    console.log('=== RECEIVED SEARCH UPDATE ===');
    console.log('Number of docs:', snapshot.docs.length);
    
    // Check if there are any changes
    if (snapshot.empty) {
      console.log('No documents found');
      callback([]);
      return;
    }

    if (!snapshot.metadata.hasPendingWrites) {
      console.log('Update is from server, not local');
    }
    
    // Use a Map to keep only the most recent search for each searchedFid
    const uniqueSearches = new Map<number, SearchedUser>();
    const recentSearches: SearchedUser[] = [];
    
    // Process docs in order (already sorted by timestamp desc)
    const processedFids = new Set<number>();
    const updatedSearches: SearchedUser[] = [];
    
    // First handle any modifications or removals
    snapshot.docChanges().forEach(change => {
      if (change.type === 'modified' || change.type === 'removed') {
        const data = change.doc.data();
        const searchedFid = data.searchedFid;
        uniqueSearches.delete(searchedFid);
        processedFids.delete(searchedFid);
      }
    });
    
    // Then process all current documents
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const searchedFid = data.searchedFid;
      
      // Skip if we've already seen this FID
      if (processedFids.has(searchedFid)) {
        return;
      }
      
      // Handle different timestamp formats
      let timestamp: number;
      if (data.timestamp) {
        if (typeof data.timestamp === 'object' && 'toMillis' in data.timestamp) {
          // Firestore Timestamp
          timestamp = data.timestamp.toMillis();
        } else if (typeof data.timestamp === 'number') {
          // Unix timestamp in milliseconds
          timestamp = data.timestamp;
        } else if (typeof data.timestamp === 'string') {
          // ISO string timestamp
          timestamp = new Date(data.timestamp).getTime();
        } else {
          console.warn('Unknown timestamp format:', data.timestamp);
          timestamp = Date.now();
        }
      } else {
        timestamp = Date.now();
      }
      
      console.log('Processing search for FID:', searchedFid, 'with timestamp:', new Date(timestamp));
      const searchedUser = {
        fid: searchedFid,
        username: data.searchedUsername,
        display_name: data.searchedDisplayName,
        pfp_url: data.searchedPfpUrl,
        follower_count: data.searchedFollowerCount || 0,
        following_count: data.searchedFollowingCount || 0,
        searchCount: 1,
        timestamp: timestamp,
        lastSearched: timestamp
      };
      
      uniqueSearches.set(searchedFid, searchedUser);
      updatedSearches.push(searchedUser);
      processedFids.add(searchedFid);
    });

    // Sort by timestamp descending (most recent first)
    const sortedSearches = updatedSearches.sort((a, b) => b.timestamp - a.timestamp);
    
    console.log('Final recent searches:', sortedSearches);
    // Take first 8 unique users
    callback(sortedSearches.slice(0, 8));
  });
};

export const getRecentSearches = async (fid?: number): Promise<SearchedUser[]> => {
  try {
    // Get from user_searches to maintain proper chronological order
    const searchesRef = collection(db, 'user_searches');
    // Use unified index pattern for both filtered and unfiltered queries
    const q = fid
      ? query(
          searchesRef,
          where('searching_fid', '==', fid),
          orderBy('timestamp', 'desc'),
          limit(20)
        )
      : query(
          searchesRef,
          orderBy('timestamp', 'desc'),
          limit(20)
        );

    const snapshot = await getDocs(q);
    
    // Use a Map to keep only the most recent search for each searchedFid
    const uniqueSearches = new Map<number, SearchedUser>();
    
    // Process docs in reverse chronological order
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const searchedFid = data.searchedFid;
      const timestamp = data.timestamp;
      
      // Only add if this fid hasn't been seen yet (first occurrence is most recent due to orderBy)
      if (!uniqueSearches.has(searchedFid)) {
        uniqueSearches.set(searchedFid, {
          fid: searchedFid,
          username: data.searchedUsername,
          display_name: data.searchedDisplayName,
          pfp_url: data.searchedPfpUrl,
          follower_count: data.searchedFollowerCount || 0,
          following_count: data.searchedFollowingCount || 0,
          searchCount: 1,
          timestamp: timestamp,
          lastSearched: timestamp
        });
      }
    });

    // Convert to array maintaining query order (already sorted by timestamp desc)
    const recentSearches: SearchedUser[] = [];
    snapshot.docs.forEach(doc => {
      const searchedFid = doc.data().searchedFid;
      const user = uniqueSearches.get(searchedFid);
      if (user && !recentSearches.some(s => s.fid === searchedFid)) {
        recentSearches.push(user);
      }
    });

    // Take first 8 unique users
    return recentSearches.slice(0, 8);
  } catch (error) {
    console.error('Error getting recent searches:', error);
    return [];
  }
};

// Track NFT play and update play count globally
export const trackNFTPlay = async (nft: NFT, fid: number) => {
  try {
    if (!nft || !fid) {
      console.error('Invalid NFT or FID provided to trackNFTPlay');
      return;
    }

    // Validate required NFT fields
    if (!nft.contract || !nft.tokenId) {
      console.error('NFT missing required fields:', { 
        contract: nft?.contract, 
        tokenId: nft?.tokenId,
        name: nft?.name,
        metadata: nft?.metadata
      });
      return;
    }

    // Ensure we have a valid name
    if (!nft.name) {
      nft.name = nft.metadata?.name || `NFT #${nft.tokenId}`;
    }

    // Get audio URL with fallbacks
    const audioUrl = nft.metadata?.animation_url || nft.audio || nft.metadata?.audio || nft.metadata?.audio_url;
    if (!audioUrl) {
      console.error('No audio URL found for NFT:', {
        contract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name,
        audio: nft.audio,
        metadata: {
          animation_url: nft.metadata?.animation_url,
          audio: nft.metadata?.audio,
          audio_url: nft.metadata?.audio_url
        }
      });
      return;
    }

    // Get mediaKey for consistent NFT content identification
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      console.error('Could not generate mediaKey for NFT:', nft);
      return;
    }

    const batch = writeBatch(db);

    // Update global_plays with mediaKey
    const globalPlayRef = doc(db, 'global_plays', mediaKey);
    const globalPlayDoc = await getDoc(globalPlayRef);

    // Get the current play count
    let currentPlayCount = 0;
    if (globalPlayDoc.exists()) {
      const data = globalPlayDoc.data();
      currentPlayCount = data.playCount || 0;
      // Keep the existing play count and increment it
      batch.update(globalPlayRef, {
        playCount: increment(1),
        lastPlayed: serverTimestamp(),
        // Always update metadata to ensure it's current
        name: nft.name || data.name || 'Untitled',
        image: nft.image || data.image || '',
        audioUrl: audioUrl || data.audioUrl,
        description: nft.description || nft.metadata?.description || data.description || '',
        collection: nft.collection?.name || data.collection || 'Unknown Collection',
        network: nft.network || data.network || 'ethereum'
      });
    } else {
      // Ensure all required fields are present and have fallback values
      const nftData = {
        mediaKey,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        description: nft.description || nft.metadata?.description || '',
        image: nft.image || nft.metadata?.image || '',
        audioUrl,
        collection: nft.collection?.name || 'Unknown Collection',
        network: nft.network || 'ethereum',
        playCount: 1,
        firstPlayed: serverTimestamp(),
        lastPlayed: serverTimestamp()
      };

      // Validate all fields before setting
      Object.entries(nftData).forEach(([key, value]) => {
        if (value === undefined) {
          console.error(`Required field ${key} is undefined in NFT data`);
          throw new Error(`Required field ${key} is undefined`);
        }
      });

      batch.set(globalPlayRef, nftData);
    }

    // Calculate new play count after the increment
    const newPlayCount = currentPlayCount + 1;

    // Update NFT document
    const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
    const nftDoc = await getDoc(nftRef);
    if (nftDoc.exists()) {
      batch.update(nftRef, {
        plays: newPlayCount,
        lastPlayed: serverTimestamp()
      });
    }

    // Update top_played collection
    const topPlayedRef = doc(db, 'top_played', mediaKey);
    const topPlayedDoc = await getDoc(topPlayedRef);
    
    if (!topPlayedDoc.exists()) {
      // First time in top_played
      batch.set(topPlayedRef, {
        mediaKey,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        image: nft.image || '',
        audioUrl: audioUrl,
        description: nft.description || nft.metadata?.description || '',
        collection: nft.collection?.name || 'Unknown Collection',
        network: nft.network || 'ethereum',
        firstTopPlayedAt: serverTimestamp(),
        lastPlayed: serverTimestamp(),
        playCount: newPlayCount
      });
    } else {
      // Update existing top_played entry with latest metadata
      const data = topPlayedDoc.data();
      batch.update(topPlayedRef, {
        lastPlayed: serverTimestamp(),
        playCount: increment(1),
        // Always update metadata to ensure it's current
        name: nft.name || data.name || 'Untitled',
        image: nft.image || data.image || '',
        audioUrl: audioUrl || data.audioUrl,
        description: nft.description || nft.metadata?.description || data.description || '',
        collection: nft.collection?.name || data.collection || 'Unknown Collection',
        network: nft.network || data.network || 'ethereum'
      });
    }

    // Also update nft_plays collection for backward compatibility
    const nftPlayData = {
      fid,
      nftContract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name || 'Untitled',
      description: nft.description || nft.metadata?.description || '',
      image: nft.image || nft.metadata?.image || '',
      audioUrl: audioUrl,
      collection: nft.collection?.name || 'Unknown Collection',
      network: nft.network || 'ethereum',
      timestamp: serverTimestamp(),
      playCount: currentPlayCount + 1 // Use the actual play count
    };
    await addDoc(collection(db, 'nft_plays'), nftPlayData);

    // Track in user's play history
    const userRef = doc(db, 'users', fid.toString());
    const playHistoryRef = collection(userRef, 'playHistory');
    await addDoc(playHistoryRef, {
      ...nftPlayData,
      mediaKey,
      timestamp: serverTimestamp()
    });

    // Commit the batch
    await batch.commit();
  } catch (error) {
    console.error('Error tracking NFT play:', error instanceof Error ? error.message : 'Unknown error');
    throw error; // Re-throw to allow handling by the caller
  }
};

// Get top played NFTs from global plays collection
export async function getTopPlayedNFTs(): Promise<{ nft: NFT; count: number }[]> {
  try {
    // Get all global plays, ordered by play count
    const globalPlaysRef = collection(db, 'global_plays');
    const q = query(
      globalPlaysRef,
      orderBy('playCount', 'desc'),
      limit(10) // Get more than we need to account for duplicates
    );
    
    const querySnapshot = await getDocs(q);
    const topPlayed: { nft: NFT; count: number }[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.mediaKey || !data.nftContract || !data.tokenId) return;
      
      // Create NFT object from global_plays data
      const nft: NFT = {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name || 'Untitled NFT',
        description: data.description || '',
        image: data.image || '',
        audio: data.audioUrl,
        hasValidAudio: Boolean(data.audioUrl),
        metadata: {
          name: data.name || 'Untitled NFT',
          description: data.description || '',
          image: data.image || '',
          animation_url: data.audioUrl
        },
        collection: {
          name: data.collection || 'Unknown Collection'
        },
        network: data.network || 'ethereum'
      };

      topPlayed.push({
        nft,
        count: data.playCount || 0
      });
    });

    // Sort by play count in descending order and deduplicate by mediaKey
    const mediaKeyMap = new Map<string, { nft: NFT; count: number }>();
    
    // Keep only the highest play count for each unique content
    topPlayed.forEach(item => {
      const mediaKey = getMediaKey(item.nft);
      if (!mediaKey) return;
      
      const existing = mediaKeyMap.get(mediaKey);
      if (!existing || item.count > existing.count) {
        mediaKeyMap.set(mediaKey, item);
      }
    });

    // Convert back to array, sort by play count, and take top 3
    const uniqueTopPlayed = Array.from(mediaKeyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    console.log('Unique top played NFTs:', uniqueTopPlayed);

    // Update top_played collection
    const batch = writeBatch(db);
    const topPlayedRef = collection(db, 'top_played');

    // First, clear existing top_played collection
    const existingTopPlayed = await getDocs(topPlayedRef);
    existingTopPlayed.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Add new top played NFTs
    for (const item of uniqueTopPlayed) {
      const mediaKey = getMediaKey(item.nft);
      if (!mediaKey) continue;
      
      const docRef = doc(topPlayedRef, mediaKey);
      const existingDoc = await getDoc(docRef);
      const now = serverTimestamp();
      
      batch.set(docRef, {
        mediaKey,
        nft: item.nft,
        playCount: item.count,
        rank: uniqueTopPlayed.indexOf(item) + 1,
        firstTopPlayedAt: existingDoc.exists() ? existingDoc.data()?.firstTopPlayedAt : now,
        lastTopPlayedAt: now,
        updatedAt: now
      });
    }

    await batch.commit();
    return uniqueTopPlayed;
  } catch (error) {
    console.error('Error getting top played NFTs:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

// Check if an NFT is currently in the top played section
export async function hasBeenTopPlayed(nft: NFT | null): Promise<boolean> {
  if (!nft) return false;
  
  try {
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) return false;

    // Get current top played NFTs
    const topPlayedRef = collection(db, 'top_played');
    const q = query(
      topPlayedRef,
      orderBy('playCount', 'desc'),
      limit(3) // Only get top 3 NFTs
    );
    
    const querySnapshot = await getDocs(q);
    let isCurrentlyTopPlayed = false;

    // Check if this NFT's mediaKey is in the current top 3
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.mediaKey === mediaKey) {
        isCurrentlyTopPlayed = true;
      }
    });
    
    return isCurrentlyTopPlayed;
  } catch (error) {
    console.error('Error checking top played status:', error);
    return false;
  }
}

// Clean up old likes and migrate to new format
export const cleanupLikes = async (fid: number) => {
  try {
    console.log('Starting likes cleanup for FID:', fid);
    const userLikesRef = collection(db, 'user_likes');
    const q = query(userLikesRef, where('fid', '==', fid));
    const querySnapshot = await getDocs(q);
    
    // Group documents by mediaKey
    const byMediaKey: { [key: string]: { docs: any[], latestTimestamp: any } } = {};
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const mediaKey = data.mediaKey || getMediaKey({
        contract: data.nftContract,
        tokenId: data.tokenId,
        audio: data.audioUrl,
        image: data.image
      } as NFT);
      
      if (!byMediaKey[mediaKey]) {
        byMediaKey[mediaKey] = { docs: [], latestTimestamp: null };
      }
      byMediaKey[mediaKey].docs.push({ id: doc.id, data });
      
      // Track the latest timestamp
      if (!byMediaKey[mediaKey].latestTimestamp || 
          (data.timestamp && data.timestamp > byMediaKey[mediaKey].latestTimestamp)) {
        byMediaKey[mediaKey].latestTimestamp = data.timestamp;
      }
    });
    
    // For each mediaKey, keep only the latest document
    const batch = writeBatch(db);
    let deleteCount = 0;
    let migrateCount = 0;
    
    for (const [mediaKey, { docs, latestTimestamp }] of Object.entries(byMediaKey)) {
      // Sort by timestamp, newest first
      docs.sort((a, b) => {
        const aTime = a.data.timestamp?.toMillis() || 0;
        const bTime = b.data.timestamp?.toMillis() || 0;
        return bTime - aTime;
      });
      
      // Keep the newest document, delete others
      const keep = docs[0];
      
      // Create new document with consistent ID format
      const encoder = new TextEncoder();
      const mediaKeyBytes = encoder.encode(mediaKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', mediaKeyBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const newDocId = `${fid}-${hashHex.substring(0, 32)}`;
      
      // Create new document with clean data
      const newDocRef = doc(db, 'user_likes', newDocId);
      batch.set(newDocRef, {
        fid,
        mediaKey,
        nftContract: keep.data.nftContract,
        tokenId: keep.data.tokenId,
        name: keep.data.name || 'Untitled',
        description: keep.data.description || '',
        image: keep.data.image || '',
        audioUrl: keep.data.audioUrl || '',
        collection: keep.data.collection || 'Unknown Collection',
        timestamp: latestTimestamp || serverTimestamp()
      });
      migrateCount++;
      
      // Delete all old documents
      docs.forEach(({ id }) => {
        if (id !== newDocId) {
          const docRef = doc(db, 'user_likes', id);
          batch.delete(docRef);
          deleteCount++;
        }
      });
    }
    
    await batch.commit();
    console.log(`Cleanup complete. Migrated ${migrateCount} likes, deleted ${deleteCount} old documents.`);
  } catch (error) {
    console.error('Error during likes cleanup:', error);
  }
};

// Get liked NFTs for a user
export const getLikedNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    console.log('Getting liked NFTs for FID:', fid);
    const userLikesRef = collection(db, 'users', fid.toString(), 'likes');
    const q = query(userLikesRef, orderBy('timestamp', 'asc'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No liked NFTs found for user:', fid);
      return [];
    }

    const likedNFTs: NFT[] = [];
    const seenMediaKeys = new Set<string>();
    const missingGlobalLikes = new Set<string>();
    
    // First, collect all media keys
    const mediaKeys = querySnapshot.docs.map(doc => doc.id);
    
    // Batch get all global likes to reduce number of requests
    const batchSize = 10;
    for (let i = 0; i < mediaKeys.length; i += batchSize) {
      const batch = mediaKeys.slice(i, i + batchSize);
      const promises = batch.map(mediaKey => {
        if (seenMediaKeys.has(mediaKey)) return null;
        seenMediaKeys.add(mediaKey);
        
        return getDoc(doc(db, 'global_likes', mediaKey))
          .then(globalLikeDoc => {
            if (!globalLikeDoc.exists()) {
              missingGlobalLikes.add(mediaKey);
              return null;
            }
            
            const globalData = globalLikeDoc.data();
            const nft: NFT = {
              contract: globalData.nftContract,
              tokenId: globalData.tokenId,
              name: globalData.name || 'Untitled',
              description: globalData.description || '',
              image: globalData.image || '',
              audio: globalData.audioUrl || '',
              hasValidAudio: Boolean(globalData.audioUrl),
              metadata: {
                name: globalData.name || 'Untitled',
                description: globalData.description || '',
                image: globalData.image || '',
                animation_url: globalData.audioUrl || ''
              },
              collection: {
                name: globalData.collection || 'Unknown Collection'
              },
              network: globalData.network || 'ethereum'
            };
            
            return nft;
          })
          .catch(err => {
            console.warn(`Error fetching global like for ${mediaKey}:`, err);
            return null;
          });
      });
      
      const results = await Promise.all(promises);
      likedNFTs.push(...results.filter(Boolean) as NFT[]);
    }
    
    // Log missing global likes once at the end instead of for each one
    if (missingGlobalLikes.size > 0) {
      console.warn(`Missing ${missingGlobalLikes.size} global like documents. First few:`, 
        [...missingGlobalLikes].slice(0, 3));
    }

    console.log('Processed liked NFTs:', likedNFTs);
    return likedNFTs;
  } catch (error) {
    console.error('Error getting liked NFTs:', error);
    return [];
  }
};

// Toggle NFT like status globally
export const toggleLikeNFT = async (nft: NFT, fid: number): Promise<boolean> => {
  try {
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      console.error('Invalid mediaKey for NFT:', nft);
      return false;
    }
    
    // Reference to global likes document
    const globalLikeRef = doc(db, 'global_likes', mediaKey);
    const userLikeRef = doc(db, 'users', fid.toString(), 'likes', mediaKey);
    
    // Get both documents in parallel for efficiency
    const [userLikeDoc, globalLikeDoc] = await Promise.all([
      getDoc(userLikeRef),
      getDoc(globalLikeRef)
    ]);
    
    const batch = writeBatch(db);
    
    if (userLikeDoc.exists()) {
      // Remove like
      // Remove from user's likes
      batch.delete(userLikeRef);
      
      if (globalLikeDoc.exists()) {
        const currentCount = globalLikeDoc.data()?.likeCount || 1;
        // Only remove global document if it's the last like
        if (currentCount <= 1) {
          console.log('Removing last like for mediaKey:', mediaKey);
          batch.delete(globalLikeRef);
        } else {
          batch.update(globalLikeRef, {
            likeCount: increment(-1),
            lastUnliked: serverTimestamp()
          });
        }
      } else {
        // If global doc doesn't exist but user like does, this is an inconsistency
        // Create a new global doc with count 0 to track this content
        console.log('Creating missing global like document for:', mediaKey);
        batch.set(globalLikeRef, {
          mediaKey,
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          image: nft.image || nft.metadata?.image || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || '',
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          likeCount: 0,
          firstLiked: serverTimestamp(),
          lastUnliked: serverTimestamp()
        });
      }

      // Update likes count in nfts collection if it exists
      const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
      const nftDoc = await getDoc(nftRef);
      if (nftDoc.exists()) {
        const currentLikes = nftDoc.data()?.likes || 1;
        batch.update(nftRef, {
          likes: Math.max(0, currentLikes - 1)
        });
      }
      
      await batch.commit();
      console.log('Removed like:', { mediaKey });
      return false;
    } else {
      // Add like
      // Always create both user and global documents
      
      // Add to user's likes with full NFT data
      batch.set(userLikeRef, {
        mediaKey,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        description: nft.description || nft.metadata?.description || '',
        image: nft.image || nft.metadata?.image || '',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        collection: nft.collection?.name || 'Unknown Collection',
        network: nft.network || 'ethereum',
        timestamp: serverTimestamp()
      });
      
      if (globalLikeDoc.exists()) {
        const globalData = globalLikeDoc.data();
        // Update existing global like document
        batch.update(globalLikeRef, {
          likeCount: increment(1),
          lastLiked: serverTimestamp(),
          // Always update metadata to ensure consistency
          name: nft.name || globalData?.name || 'Untitled',
          description: nft.description || nft.metadata?.description || globalData?.description || '',
          image: nft.image || nft.metadata?.image || globalData?.image || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || globalData?.audioUrl || '',
          collection: nft.collection?.name || globalData?.collection || 'Unknown Collection',
          network: nft.network || globalData?.network || 'ethereum'
        });
      } else {
        // Create new global like document with full NFT data
        batch.set(globalLikeRef, {
          mediaKey,
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          image: nft.image || nft.metadata?.image || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || '',
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          likeCount: 1,
          firstLiked: serverTimestamp(),
          lastLiked: serverTimestamp()
        });
      }

      // Update likes count in nfts collection if it exists
      const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
      const nftDoc = await getDoc(nftRef);
      if (nftDoc.exists()) {
        const currentLikes = nftDoc.data()?.likes || 0;
        batch.update(nftRef, {
          likes: currentLikes + 1
        });
      }
      
      await batch.commit();
      console.log('Added like:', { mediaKey });
      return true;
    }
  } catch (error) {
    console.error('Error toggling NFT like:', error);
    return false;
  }
};

// Subscribe to recent plays
export const subscribeToRecentPlays = (fid: number, callback: (nfts: NFT[]) => void) => {
  // Listen to nft_plays collection
  const playsRef = collection(db, 'nft_plays');
  const q = query(playsRef, where('fid', '==', fid), orderBy('timestamp', 'desc'), limit(20));

  return onSnapshot(q, (snapshot) => {
    const recentNFTs: NFT[] = [];
    const seenKeys = new Set<string>();

    // Process each play history entry
    for (const playDoc of snapshot.docs) {
      const playData = playDoc.data();
      const nftKey = `${playData.nftContract}-${playData.tokenId}`;
      
      // Skip if we've already seen this NFT
      if (seenKeys.has(nftKey)) continue;
      seenKeys.add(nftKey);

      const nft: NFT = {
        contract: playData.nftContract,
        tokenId: playData.tokenId,
        name: playData.name || 'Untitled NFT',
        description: playData.description || '',
        image: playData.image || '',
        audio: playData.audioUrl || '',
        hasValidAudio: Boolean(playData.audioUrl),
        metadata: {
          name: playData.name || 'Untitled NFT',
          description: playData.description || '',
          image: playData.image || '',
          animation_url: playData.audioUrl || ''
        },
        collection: {
          name: playData.collection || 'Unknown Collection'
        },
        network: playData.network || 'ethereum'
      };
      recentNFTs.push(nft);

      // Stop after we have 6 unique NFTs
      if (recentNFTs.length >= 6) break;
    }

    callback(recentNFTs);
  });
};

// Fetch NFT details from contract
export const fetchNFTDetails = async (contractAddress: string, tokenId: string): Promise<NFT | null> => {
  try {
    const nftRef = doc(db, 'nft_details', `${contractAddress}-${tokenId}`);
    const snapshot = await getDocs(query(collection(db, 'nft_details'), 
      where('contract', '==', contractAddress),
      where('tokenId', '==', tokenId)
    ));

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return {
        contract: data.contract,
        tokenId: data.tokenId,
        name: data.name,
        description: data.description,
        image: data.image,
        audio: data.audioUrl,
        hasValidAudio: true,
        metadata: {
          name: data.name,
          description: data.description,
          image: data.image,
          animation_url: data.audioUrl
        },
        collection: {
          name: data.collection
        },
        network: data.network
      };
    }

    // If not in our database, fetch from chain
    const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!neynarKey) throw new Error('Neynar API key not found');

    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${contractAddress}&token_id=${tokenId}`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': neynarKey
        }
      }
    );

    const data = await response.json();
    if (!data.result) return null;

    const nft: NFT = {
      contract: contractAddress,
      tokenId: tokenId,
      name: data.result.metadata?.name || 'Untitled NFT',
      description: data.result.metadata?.description,
      image: data.result.metadata?.image || '',
      audio: data.result.metadata?.animation_url || '',
      hasValidAudio: !!data.result.metadata?.animation_url,
      metadata: {
        name: data.result.metadata?.name,
        description: data.result.metadata?.description,
        image: data.result.metadata?.image,
        animation_url: data.result.metadata?.animation_url,
        attributes: data.result.metadata?.attributes
      },
      collection: {
        name: data.result.collection?.name || 'Unknown Collection',
        image: data.result.collection?.image
      },
      network: 'ethereum'
    };

    // Cache the NFT details
    await addDoc(collection(db, 'nft_details'), {
      contract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name,
      description: nft.description,
      image: nft.image,
      audioUrl: nft.audio,
      collection: nft.collection?.name,
      network: nft.network,
      timestamp: new Date().toISOString()
    });

    return nft;
  } catch (error) {
    console.error('Error fetching NFT details:', error);
    return null;
  }
};

// Add NFT to user's liked collection
export const addLikedNFT = async (fid: number, nft: NFT): Promise<void> => {
  try {
    const docId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const userLikesRef = doc(db, 'user_likes', docId);
    
    console.log('Adding NFT to likes:', { fid, docId });
    
    await setDoc(userLikesRef, {
      name: nft.name || 'Untitled',
      description: nft.description || '',
      image: nft.image || nft.metadata?.image || '',
      audioUrl: nft.audio || nft.metadata?.animation_url || '',
      collection: nft.collection?.name || 'Unknown Collection',
      network: nft.network || 'ethereum',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error adding liked NFT:', error);
    throw error;
  }
};

// Remove NFT from user's liked collection
export const removeLikedNFT = async (fid: number, nft: NFT): Promise<void> => {
  try {
    const docId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const userLikesRef = doc(db, 'user_likes', docId);
    
    // Delete the document for this liked NFT
    await deleteDoc(userLikesRef);
    
    console.log('Removed NFT from likes:', { fid, docId });
  } catch (error) {
    console.error('Error removing liked NFT:', error);
  }
};

// Fetch NFTs for a specific user by their fid
export const fetchUserNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    console.log('=== START NFT FETCH for FID:', fid, ' ===');
    
    // First check for cached wallet
    const cachedAddress = await getCachedWallet(fid);
    let addresses = new Set<string>();
    
    if (cachedAddress) {
      console.log('Found cached wallet address:', cachedAddress);
      addresses.add(cachedAddress);
    }

    // If no cached wallet, get the user's addresses from searchedusers collection
    console.log('No cached wallet, fetching user data from searchedusers collection...');
    const userDoc = await getDoc(doc(db, 'searchedusers', fid.toString()));
    if (!userDoc.exists()) {
      console.error('User not found in searchedusers collection');
      return [];
    }

    const userData = userDoc.data();
    console.log('User data from searchedusers:', userData);
    
    // Add addresses from user data
    
    // Add custody address if it exists
    if (userData.custody_address) {
      console.log('Found custody address:', userData.custody_address);
      addresses.add(userData.custody_address);
      // Cache this address for future use
      await cacheUserWallet(fid, userData.custody_address);
    }
    
    // Handle both old and new data structures for verified addresses
    if (userData.verifiedAddresses) {
      if (Array.isArray(userData.verifiedAddresses)) {
        // New structure - flat array
        console.log('Found verified addresses (new format):', userData.verifiedAddresses);
        userData.verifiedAddresses.forEach((addr: string) => addresses.add(addr));
      } else if (typeof userData.verifiedAddresses === 'object' && 
                 userData.verifiedAddresses !== null && 
                 'eth_addresses' in userData.verifiedAddresses && 
                 Array.isArray(userData.verifiedAddresses.eth_addresses)) {
        // Old structure - nested eth_addresses
        console.log('Found verified addresses (old format):', userData.verifiedAddresses.eth_addresses);
        userData.verifiedAddresses.eth_addresses.forEach((addr: string) => addresses.add(addr));
      }
    }

    // Convert Set to Array
    const uniqueAddresses = Array.from(addresses);

    if (uniqueAddresses.length === 0) {
      console.log('No addresses found for user');
      return [];
    }

    // Cache first address if no custody address was cached
    if (!userData.custody_address && uniqueAddresses.length > 0) {
      await cacheUserWallet(fid, uniqueAddresses[0]);
    }

    console.log('Total unique addresses to check:', uniqueAddresses.length);
    console.log('Addresses:', uniqueAddresses);

    // If we found no addresses in searchedusers, try getting them from Neynar
    if (uniqueAddresses.length === 0) {
      console.log('No addresses found in searchedusers, fetching from Neynar...');
      const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      if (!neynarKey) throw new Error('Neynar API key not found');

      const profileResponse = await fetchWithRetry(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey
          }
        }
      );

      const profileData = await profileResponse.json();
      console.log('Neynar profile response:', profileData);

      if (profileData.users?.[0]) {
        const user = profileData.users[0];
        if (user.custody_address) {
          console.log('Found custody address from Neynar:', user.custody_address);
          uniqueAddresses.push(user.custody_address);
          await cacheUserWallet(fid, user.custody_address);
        }
        if (user.verified_addresses?.eth_addresses) {
          console.log('Found verified addresses from Neynar:', user.verified_addresses.eth_addresses);
          user.verified_addresses.eth_addresses.forEach((addr: string) => uniqueAddresses.push(addr));
        }
      }
    }

    if (uniqueAddresses.length === 0) {
      console.log('No addresses found for user after all attempts');
      return [];
    }

    // Fetch NFTs from Alchemy for all addresses
    console.log('Fetching NFTs from Alchemy...');
    const { fetchUserNFTsFromAlchemy } = await import('./alchemy');
    const alchemyPromises = uniqueAddresses.map(address => {
      console.log('Fetching NFTs for address:', address);
      return fetchUserNFTsFromAlchemy(address);
    });
    
    const alchemyResults = await Promise.all(alchemyPromises);
    console.log('Alchemy results by address:', alchemyResults.map((nfts, i) => ({
      address: uniqueAddresses[i],
      nftCount: nfts.length
    })));
    
    // Deduplicate NFTs by contract+tokenId
    const nftMap = new Map<string, NFT>();
    alchemyResults.flat().forEach(nft => {
      const key = `${nft.contract}-${nft.tokenId}`;
      if (!nftMap.has(key)) {
        nftMap.set(key, nft);
      }
    });

    const uniqueNFTs = Array.from(nftMap.values());
    console.log('=== NFT FETCH COMPLETE ===');
    console.log('Total unique NFTs found:', uniqueNFTs.length);
    return uniqueNFTs;
  } catch (error) {
    console.error('Error fetching user NFTs:', error);
    return [];
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) { // Rate limit
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}`);
        await delay(waitTime);
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.error(`Fetch attempt ${i + 1} failed:`, error);
      await delay(1000); // Wait 1s between retries
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
};

// Store featured NFTs in Firebase if they don't exist
export const ensureFeaturedNFTsExist = async (nfts: NFT[]): Promise<void> => {
  try {
    const batch = writeBatch(db);
    
    for (const nft of nfts) {
      const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
      const nftDoc = await getDoc(nftRef);
      
      if (!nftDoc.exists()) {
        batch.set(nftRef, {
          ...nft,
          likes: 0,
          plays: 0,
          timestamp: serverTimestamp()
        });
      }
    }
    
    await batch.commit();
    console.log('Featured NFTs stored in Firebase');
  } catch (error) {
    console.error('Error storing featured NFTs:', error);
  }
};

// Declare searchTimeout at module level
let searchTimeout: NodeJS.Timeout | undefined;

export const searchUsers = async (query: string): Promise<FarcasterUser[]> => {
  // Clear any pending search
  if (searchTimeout) clearTimeout(searchTimeout);

  // Return early if query is too short
  if (query.length < 2) return [];
  try {
    const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!neynarKey) throw new Error('Neynar API key not found');

    console.log('=== START USER SEARCH ===');
    // If query is a number, treat it as FID
    const isFid = !isNaN(Number(query));
    const endpoint = isFid 
      ? `https://api.neynar.com/v2/farcaster/user/bulk?fids=${query}`
      : `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(query)}`;

    console.log('Fetching from endpoint:', endpoint);
    const response = await fetchWithRetry(endpoint, {
      headers: {
        'accept': 'application/json',
        'api_key': neynarKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch user data: ${errorText}`);
    }

    const data = await response.json();
    console.log('Initial API response:', data);
    
    // Handle different response structures for search vs bulk lookup
    let users = isFid ? data.users : data.result?.users || [];
    
    // If we got users from search, fetch their full profiles
    if (!isFid && users.length > 0) {
      const fids = users.map((u: any) => u.fid).join(',');
      console.log('Fetching full profiles for FIDs:', fids);
      
      const profileResponse = await fetchWithRetry(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey
          }
        }
      );

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        throw new Error(`Failed to fetch user profiles: ${errorText}`);
      }

      const profileData = await profileResponse.json();
      console.log('Profile data response:', profileData);
      users = profileData.users;
    }

    // Map and clean up user data
    return users.map((user: any) => {
      let allAddresses: string[] = [];

      // Get verified addresses
      if (user.verifications) {
        allAddresses = [...user.verifications];
      }

      // Get custody address
      if (user.custody_address) {
        allAddresses.push(user.custody_address);
      }

      // Filter addresses
      allAddresses = [...new Set(allAddresses)].filter(addr => 
        addr && addr.startsWith('0x') && addr.length === 42
      );

      console.log('Processed addresses for user:', {
        fid: user.fid,
        username: user.username,
        addresses: allAddresses
      });

      return {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name || user.username,
        pfp_url: user.pfp_url || `https://avatar.vercel.sh/${user.username}`,
        follower_count: user.follower_count || 0,
        following_count: user.following_count || 0,
        custody_address: user.custody_address,
        verified_addresses: {
          eth_addresses: allAddresses
        }
      };
    });
  } catch (error) {
    console.error('Error searching users:', error);
    return []; // Return empty array instead of throwing to maintain backward compatibility
  }
};