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

    // Store user data in searchedusers collection for NFT retrieval
    const searchedUserRef = doc(db, 'searchedusers', searchedUser.fid.toString());
    const searchedUserDoc = await getDoc(searchedUserRef);
    const existingSearchData = searchedUserDoc.exists() ? searchedUserDoc.data() : {};
    
    const searchedUserData = {
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      custody_address: finalAddresses[0] || null,
      verifiedAddresses: finalAddresses,
      follower_count: user.follower_count,
      following_count: user.following_count,
      searchCount: (existingSearchData.searchCount || 0) + 1,
      lastSearched: serverTimestamp(),
      timestamp: existingSearchData.timestamp || serverTimestamp()
    };

    await setDoc(searchedUserRef, searchedUserData);

    // Cache the first available address for NFT retrieval
    if (finalAddresses.length > 0) {
      await cacheUserWallet(user.fid, finalAddresses[0]);
    }

    // Track the search in user_searches collection for recent searches
    const searchRef = collection(db, 'user_searches');
    await addDoc(searchRef, {
      fid,
      searchedFid: user.fid,
      searchedUsername: user.username,
      searchedDisplayName: user.display_name,
      searchedPfpUrl: user.pfp_url,
      searchedFollowerCount: user.follower_count,
      searchedFollowingCount: user.following_count,
      timestamp: serverTimestamp()
    });

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
export const getRecentSearches = async (fid?: number): Promise<SearchedUser[]> => {
  try {
    const searchesRef = collection(db, 'user_searches');
    const q = fid
      ? query(searchesRef, where('fid', '==', fid), orderBy('timestamp', 'desc'), limit(20)) 
      : query(searchesRef, orderBy('timestamp', 'desc'), limit(20));

    const snapshot = await getDocs(q);
    
    // Use a Map to keep only the most recent search for each searchedFid
    const uniqueSearches = new Map<number, SearchedUser>();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const searchedFid = data.searchedFid;
      
      // Only add if this fid hasn't been seen yet or if this is a more recent search
      const existingSearch = uniqueSearches.get(searchedFid);
      if (!existingSearch || data.timestamp > existingSearch.timestamp) {
        uniqueSearches.set(searchedFid, {
          fid: searchedFid,
          username: data.searchedUsername,
          display_name: data.searchedDisplayName,
          pfp_url: data.searchedPfpUrl,
          follower_count: data.searchedFollowerCount || 0,
          following_count: data.searchedFollowingCount || 0,
          searchCount: 1,
          timestamp: data.timestamp,
          lastSearched: data.timestamp
        });
      }
    });

    // Convert Map values to array and take only the first 8 unique users
    return Array.from(uniqueSearches.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
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

    const audioUrl = nft.metadata?.animation_url || nft.audio;
    if (!audioUrl) {
      console.error('No audio URL found for NFT:', nft);
      return;
    }

    // Get mediaKey for consistent NFT content identification
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      console.error('Could not generate mediaKey for NFT:', nft);
      return;
    }

    // Reference to global play count document
    const globalPlayRef = doc(db, 'global_plays', mediaKey);
    const globalPlayDoc = await getDoc(globalPlayRef) as DocumentSnapshot;

    const batch = writeBatch(db);

    if (globalPlayDoc.exists()) {
      const data = globalPlayDoc.data();
      // Update existing global play count
      batch.update(globalPlayRef, {
        playCount: increment(1),
        lastPlayed: serverTimestamp(),
        // Update metadata if needed
        name: nft.name || data?.name || 'Untitled',
        image: nft.image || data?.image || '',
        audioUrl: audioUrl || data?.audioUrl || ''
      });
    } else {
      // Create new global play count
      batch.set(globalPlayRef, {
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
      });
    }

    // Track in user's history for recently played feature
    const userHistoryRef = doc(db, 'users', fid.toString(), 'playHistory', mediaKey);
    batch.set(userHistoryRef, {
      mediaKey,
      timestamp: serverTimestamp()
    });

    // Commit all changes in a single batch
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
      limit(10) // Get top 10 most played
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

    // Sort by play count in descending order
    const sortedTopPlayed = topPlayed.sort((a, b) => b.count - a.count);
    console.log('Top played NFTs:', sortedTopPlayed);

    // Update top_played collection
    const batch = writeBatch(db);
    const topPlayedRef = collection(db, 'top_played');

    // First, clear existing top_played collection
    const existingTopPlayed = await getDocs(topPlayedRef);
    existingTopPlayed.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Add new top played NFTs
    for (const item of sortedTopPlayed) {
      const mediaKey = getMediaKey(item.nft);
      if (!mediaKey) continue;
      
      const docRef = doc(topPlayedRef, mediaKey);
      const existingDoc = await getDoc(docRef);
      const now = serverTimestamp();
      
      batch.set(docRef, {
        mediaKey,
        nft: item.nft,
        playCount: item.count,
        rank: sortedTopPlayed.indexOf(item) + 1,
        firstTopPlayedAt: existingDoc.exists() ? existingDoc.data()?.firstTopPlayedAt : now,
        lastTopPlayedAt: now,
        updatedAt: now
      });
    }

    await batch.commit();
    return sortedTopPlayed;
  } catch (error) {
    console.error('Error getting top played NFTs:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

// Check if an NFT has ever been in the top played section
export async function hasBeenTopPlayed(nft: NFT | null): Promise<boolean> {
  if (!nft) return false;
  
  try {
    const mediaKey = getMediaKey(nft);
    console.log('Checking top played status for:', { mediaKey, nft });
    
    // Check for NFTs that have been in top played
    const topPlayedRef = collection(db, 'top_played');
    const q = query(topPlayedRef, where('mediaKey', '==', mediaKey));
    const querySnapshot = await getDocs(q);
    
    // Log what we found
    let hasBeenTop = false;
    querySnapshot.forEach(doc => {
      const data = doc.data();
      console.log('Found top played doc:', { id: doc.id, data });
      if (data.firstTopPlayedAt) {
        hasBeenTop = true;
      }
    });
    
    return hasBeenTop;
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
    const userLikesRef = collection(db, 'user_likes');
    const q = query(userLikesRef, where('fid', '==', fid));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No liked NFTs found for user:', fid);
      return [];
    }

    const likedNFTs: NFT[] = [];
    const seenMediaKeys = new Set<string>();
    
    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      
      // Skip if no mediaKey (shouldn't happen after cleanup)
      if (!data.mediaKey) {
        console.warn('Found like without mediaKey:', data);
        continue;
      }
      
      // Skip duplicates
      if (seenMediaKeys.has(data.mediaKey)) continue;
      seenMediaKeys.add(data.mediaKey);
      
      const nft: NFT = {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name || 'Untitled',
        description: data.description || '',
        image: data.image || '',
        audio: data.audioUrl || '',
        hasValidAudio: Boolean(data.audioUrl),
        metadata: {
          name: data.name || 'Untitled',
          description: data.description || '',
          image: data.image || '',
          animation_url: data.audioUrl || ''
        },
        collection: {
          name: data.collection || 'Unknown Collection'
        },
        network: 'ethereum'
      };
      
      likedNFTs.push(nft);
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
    
    // Reference to global likes document
    const globalLikeRef = doc(db, 'global_likes', mediaKey);
    const userLikeRef = doc(db, 'users', fid.toString(), 'likes', mediaKey);
    
    // Check if user has liked this NFT
    const userLikeDoc = await getDoc(userLikeRef);
    
    if (userLikeDoc.exists()) {
      // Remove like
      const batch = writeBatch(db);
      
      // Remove from user's likes
      batch.delete(userLikeRef);
      
      // Decrement global like count
      batch.update(globalLikeRef, {
        likeCount: increment(-1)
      });
      
      await batch.commit();
      console.log('Removed like:', { mediaKey });
      return false;
    } else {
      // Add like
      const batch = writeBatch(db);
      
      // Add to user's likes
      batch.set(userLikeRef, {
        mediaKey,
        timestamp: serverTimestamp()
      });
      
      // Get global like document
      const globalLikeDoc = await getDoc(globalLikeRef);
      
      if (globalLikeDoc.exists()) {
        // Increment existing global like count
        batch.update(globalLikeRef, {
          likeCount: increment(1),
          lastLiked: serverTimestamp()
        });
      } else {
        // Create new global like document
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
  const playsRef = collection(db, 'nft_plays');
  const q = query(playsRef, where('fid', '==', fid), orderBy('timestamp', 'desc'), limit(8));

  return onSnapshot(q, (snapshot) => {
    const nfts = snapshot.docs.map(doc => {
      const data = doc.data();
      // Create NFT object with full metadata structure
      return {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name,
        description: data.description || null, // Set to null if not present
        image: data.image,
        audio: data.audioUrl,
        hasValidAudio: true,
        metadata: {
          name: data.name,
          description: data.description || null, // Set to null if not present
          image: data.image,
          animation_url: data.audioUrl
        },
        collection: {
          name: data.collection
        },
        network: data.network
      };
    });
    callback(nfts);
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

// Search users by FID or username
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

export const searchUsers = async (query: string): Promise<FarcasterUser[]> => {
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
    return [];
  }
};