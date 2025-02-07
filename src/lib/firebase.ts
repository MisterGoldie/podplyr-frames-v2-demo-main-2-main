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
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  doc,
  increment,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import type { NFT, FarcasterUser, SearchedUser, NFTPlayData } from '../types/user';

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
export const db = getFirestore(app);

// Track user search and return Farcaster user data
export const trackUserSearch = async (username: string, fid: number): Promise<FarcasterUser> => {
  try {
    const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!neynarKey) throw new Error('Neynar API key not found');

    console.log('Searching for user:', username);
    // First search for the user to get their FID
    const searchResponse = await fetch(
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
    const profileResponse = await fetch(
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

    // Save search to Firebase
    await addDoc(collection(db, 'user_searches'), {
      fid,
      searchedUsername: username,
      searchedFid: user.fid,
      searchedDisplayName: user.display_name,
      searchedPfpUrl: user.pfp_url,
      timestamp: serverTimestamp()
    });

    console.log('Returning user data with addresses:', {
      custody_address: user.custody_address,
      verified_addresses: user.verified_addresses
    });

    // Return the full user profile with both custody and verified addresses
    return {
      ...user,
      custody_address: user.custody_address,
      verified_addresses: user.verified_addresses || { eth_addresses: [] }
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
      
      // Only add if this fid hasn't been seen yet
      if (!uniqueSearches.has(searchedFid)) {
        uniqueSearches.set(searchedFid, {
          fid: searchedFid,
          username: data.searchedUsername,
          display_name: data.searchedDisplayName,
          pfp_url: data.searchedPfpUrl,
          timestamp: data.timestamp?.toMillis()
        });
      }
    });

    // Convert Map values to array and take only the first 8 unique users
    return Array.from(uniqueSearches.values()).slice(0, 8);
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
      timestamp: serverTimestamp(),
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
        timestamp: serverTimestamp(),
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
        lastPlayed: data.timestamp?.toDate() || new Date(),
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
      const playDate = data.timestamp?.toDate() || new Date();
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

// Toggle NFT like status
export const toggleLikeNFT = async (nft: NFT, fid: number): Promise<boolean> => {
  try {
    const userLikesRef = doc(db, 'user_likes', fid.toString());
    const nftId = `${nft.contract}-${nft.tokenId}`;
    const snapshot = await getDocs(query(collection(db, 'user_likes'), where('fid', '==', fid)));
    const isLiked = snapshot.docs.some(doc => doc.data().likedNFTs?.includes(nftId));

    if (isLiked) {
      await updateDoc(userLikesRef, {
        likedNFTs: arrayRemove(nftId)
      });
    } else {
      await updateDoc(userLikesRef, {
        likedNFTs: arrayUnion(nftId)
      });
    }

    return !isLiked;
  } catch (error) {
    console.error('Error toggling NFT like:', error);
    return false;
  }
};

// Get liked NFTs for a user
export const getLikedNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    const userLikesRef = doc(db, 'user_likes', fid.toString());
    const snapshot = await getDocs(query(collection(db, 'nft_details'), where('likedBy', 'array-contains', fid)));

    return snapshot.docs.map(doc => {
      const data = doc.data();
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
    });
  } catch (error) {
    console.error('Error getting liked NFTs:', error);
    return [];
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
      timestamp: serverTimestamp()
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
    const userLikesRef = doc(db, 'user_likes', fid.toString());
    const nftId = `${nft.contract}-${nft.tokenId}`;

    await updateDoc(userLikesRef, {
      likedNFTs: arrayUnion(nftId)
    });

    // Also update the NFT's likedBy array
    const nftRef = doc(db, 'nft_details', nftId);
    await updateDoc(nftRef, {
      likedBy: arrayUnion(fid)
    });
  } catch (error) {
    console.error('Error adding liked NFT:', error);
  }
};

// Remove NFT from user's liked collection
export const removeLikedNFT = async (fid: number, nft: NFT): Promise<void> => {
  try {
    const userLikesRef = doc(db, 'user_likes', fid.toString());
    const nftId = `${nft.contract}-${nft.tokenId}`;

    await updateDoc(userLikesRef, {
      likedNFTs: arrayRemove(nftId)
    });

    // Also update the NFT's likedBy array
    const nftRef = doc(db, 'nft_details', nftId);
    await updateDoc(nftRef, {
      likedBy: arrayRemove(fid)
    });
  } catch (error) {
    console.error('Error removing liked NFT:', error);
  }
};

// Fetch NFTs for a specific user by their fid
export const fetchUserNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    const userNFTsRef = collection(db, 'nft_plays');
    const q = query(
      userNFTsRef,
      where('playedBy', '==', fid),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name || 'Untitled',
        description: data.description,
        audio: data.audioUrl,
        image: data.image,
        metadata: data.metadata,
        collection: data.collection,
        network: data.network,
        playTracked: true
      };
    });
  } catch (error) {
    console.error('Error fetching user NFTs:', error);
    return [];
  }
};

export const searchUsers = async (username: string): Promise<any[]> => {
  try {
    // Implement your user search logic here
    // This is a placeholder implementation
    return [];
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
};