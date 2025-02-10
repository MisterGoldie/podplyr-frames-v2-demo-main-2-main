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
  serverTimestamp
} from 'firebase/firestore';
import type { NFT, FarcasterUser, SearchedUser, NFTPlayData } from '../types/user';
import { fetchUserNFTsFromAlchemy } from './alchemy';

// Initialize Firebase with your config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
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

    // Store user data in searchedusers collection with previous structure
    const searchedUserRef = doc(db, 'searchedusers', searchedUser.fid.toString());
    const searchedUserDoc = await getDoc(searchedUserRef);
    const existingSearchData = searchedUserDoc.exists() ? searchedUserDoc.data() : {};
    
    const searchedUserData = {
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      custody_address: finalAddresses[0] || null, // Use first address or null
      verifiedAddresses: finalAddresses,
      follower_count: user.follower_count,
      following_count: user.following_count,
      searchCount: (existingSearchData.searchCount || 0) + 1,
      lastSearched: serverTimestamp(),
      timestamp: existingSearchData.timestamp || serverTimestamp()
    };

    await setDoc(searchedUserRef, searchedUserData);

    // Cache the first available address
    if (finalAddresses.length > 0) {
      await cacheUserWallet(user.fid, finalAddresses[0]);
    }

    // Track the search in user_searches collection
    const searchRef = collection(db, 'user_searches');
    await addDoc(searchRef, {
      fid,
      searchedFid: user.fid,
      searchedUsername: user.username,
      searchedDisplayName: user.display_name,
      searchedPfpUrl: user.pfp_url,
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
    const searchedUsersRef = collection(db, 'searchedusers');
    const q = fid
      ? query(searchedUsersRef, where('fid', '==', fid), orderBy('lastSearched', 'desc'), limit(8))
      : query(searchedUsersRef, orderBy('lastSearched', 'desc'), limit(8));

    const snapshot = await getDocs(q);
    const searches: SearchedUser[] = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      searches.push({
        fid: data.fid,
        username: data.username,
        display_name: data.display_name,
        pfp_url: data.pfp_url,
        follower_count: data.follower_count,
        following_count: data.following_count,
        custody_address: data.custody_address,
        verifiedAddresses: data.verifiedAddresses,
        searchCount: data.searchCount || 0,
        lastSearched: data.lastSearched,
        timestamp: data.timestamp
      });
    });

    return searches;
  } catch (error) {
    console.error('Error getting recent searches:', error);
    return [];
  }
};

// Track NFT play and update play count
export const trackNFTPlay = async (nft: NFT, fid: number) => {
  try {
    // Get the audio URL from either source
    const audioUrl = nft.metadata?.animation_url || nft.audio;
    if (!audioUrl) return;

    // Store play data with default values for undefined fields
    const playData = {
      fid,
      nftContract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name || 'Untitled',
      description: nft.description || '',
      image: nft.image || nft.metadata?.image || '',
      audioUrl: audioUrl,
      collection: nft.collection?.name || 'Unknown Collection',
      network: nft.network || 'ethereum',
      timestamp: new Date().toISOString(),
      playCount: 1
    };

    // Add to global nft_plays collection
    await addDoc(collection(db, 'nft_plays'), playData);

    // Add to user's play history
    const userRef = doc(db, 'users', fid.toString());
    const playHistoryRef = collection(userRef, 'playHistory');

    // Check if the NFT has been played before
    const q = query(
      playHistoryRef,
      where('nftContract', '==', nft.contract),
      where('tokenId', '==', nft.tokenId)
    );

    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      // Update existing play history
      const docRef = querySnapshot.docs[0].ref;
      await updateDoc(docRef, {
        timestamp: new Date().toISOString(),
        playCount: increment(1)
      });
    } else {
      // Create new play history
      await addDoc(playHistoryRef, playData);
    }
  } catch (error) {
    console.error('Error tracking NFT play:', error);
  }
};

// Get top played NFTs
export async function getTopPlayedNFTs(): Promise<{ nft: NFT; count: number }[]> {
  const nftPlaysRef = collection(db, 'nft_plays');
  const q = query(
    nftPlaysRef,
    orderBy('nftContract'),
    orderBy('tokenId')
  );
  
  const querySnapshot = await getDocs(q);
  const playCount: { [key: string]: { count: number, nft: NFT, lastPlayed: Date } } = {};
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const nftKey = `${data.nftContract.toLowerCase()}-${data.tokenId}`;
    
    if (!playCount[nftKey]) {
      playCount[nftKey] = {
        count: 1,
        lastPlayed: new Date(data.timestamp),
        nft: {
          contract: data.nftContract,
          tokenId: data.tokenId,
          name: data.name,
          description: data.description,
          image: data.image,
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
          network: data.network || 'ethereum'
        }
      };
    } else {
      playCount[nftKey].count++;
      const playDate = new Date(data.timestamp);
      if (playDate > playCount[nftKey].lastPlayed) {
        playCount[nftKey].lastPlayed = playDate;
      }
    }
  });

  return Object.values(playCount)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastPlayed.getTime() - a.lastPlayed.getTime();
    })
    .slice(0, 3)
    .map(({ nft, count }) => ({ nft, count }));
}

// Get liked NFTs for a user
export const getLikedNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    console.log('Getting liked NFTs for FID:', fid);
    const userLikesRef = collection(db, 'user_likes');
    const q = query(userLikesRef, where(documentId(), '>=', `${fid}-`), where(documentId(), '<', `${fid + 1}-`));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No liked NFTs found for user:', fid);
      return [];
    }

    const likedNFTs: NFT[] = [];
    
    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const [docFid, contract, tokenId] = doc.id.split('-');
      
      if (contract && tokenId) {
        likedNFTs.push({
          contract,
          tokenId,
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
          }
        });
      }
    }

    console.log('Processed liked NFTs:', likedNFTs);
    return likedNFTs;
  } catch (error) {
    console.error('Error getting liked NFTs:', error);
    return [];
  }
};

// Toggle NFT like status
export const toggleLikeNFT = async (nft: NFT, fid: number): Promise<boolean> => {
  try {
    const docId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const userLikesRef = doc(db, 'user_likes', docId);
    const docSnap = await getDoc(userLikesRef);
    
    console.log('Toggling NFT:', { fid, docId });
    
    if (docSnap.exists()) {
      await deleteDoc(userLikesRef);
      return false;
    } else {
      await setDoc(userLikesRef, {
        name: nft.name || 'Untitled',
        description: nft.description || '',
        image: nft.image || nft.metadata?.image || '',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        collection: nft.collection?.name || 'Unknown Collection',
        network: nft.network || 'ethereum',
        timestamp: serverTimestamp()
      });
      return true;
    }
  } catch (error) {
    console.error('Error toggling NFT like:', error);
    throw error;
  }
};

// Subscribe to recent plays
export const subscribeToRecentPlays = (fid: number, callback: (nfts: NFT[]) => void) => {
  const playsRef = collection(db, 'nft_plays');
  const q = query(playsRef, where('fid', '==', fid), orderBy('timestamp', 'desc'), limit(8));

  return onSnapshot(q, (snapshot) => {
    const nfts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        contract: data.nftContract,
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
        if (user.verified_addresses) {
          console.log('Found verified addresses from Neynar:', user.verified_addresses);
          user.verified_addresses.forEach((addr: string) => uniqueAddresses.push(addr));
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