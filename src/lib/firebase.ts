import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp, orderBy, limit, addDoc, deleteDoc } from 'firebase/firestore';
import { Alchemy, Network } from 'alchemy-sdk';
import { signInAnonymously, getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Add validation for all required config values
if (!firebaseConfig.apiKey) {
  throw new Error('Firebase API Key is missing');
}

if (!firebaseConfig.authDomain) {
  throw new Error('Firebase Auth Domain is missing');
}

if (!firebaseConfig.projectId) {
  throw new Error('Firebase Project ID is missing');
}

// Initialize Firebase only if config is valid
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export interface SearchedUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  follower_count: number;
  following_count: number;
  profile?: {
    bio?: {
      text?: string;
    } | string;
  };
  verifiedAddresses?: string[];
  lastSearched: Date;
  searchCount: number;
  cachedWallet?: {
    address: string;
    lastUpdated: Date;
  };
}

const alchemy = new Alchemy({
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET
});

const auth = getAuth(app);

export async function ensureFirebaseAuth() {
  if (!auth) {
    throw new Error('Firebase auth not initialized');
  }

  try {
    if (!auth.currentUser) {
      const result = await signInAnonymously(auth);
      if (!result.user) {
        throw new Error('Failed to create anonymous user');
      }
      console.log('Anonymous auth successful:', result.user.uid);
    }
    return auth.currentUser;
  } catch (error: any) {
    console.error('Firebase auth error:', {
      code: error.code,
      message: error.message,
      name: error.name
    });
    throw error;
  }
}

export async function trackUserSearch(user: any) {
  try {
    const searchesRef = collection(db, 'searchedusers');
    const docRef = doc(searchesRef, user.fid.toString());
    
    // Get existing data first
    const docSnap = await getDoc(docRef);
    const existingData = docSnap.exists() ? docSnap.data() : {};
    
    // Clean and validate the data before sending to Firestore
    const userData = {
      ...existingData,
      fid: user.fid,
      username: user.username,
      display_name: user.display_name || null,
      pfp_url: user.pfp_url || null,
      follower_count: user.follower_count,
      following_count: user.following_count,
      verifiedAddresses: user.verifiedAddresses || [], // Ensure it's an array
      lastSearched: serverTimestamp(),
      searchCount: (existingData.searchCount || 0) + 1
    };

    await setDoc(docRef, userData);
  } catch (error) {
    console.error('Error tracking user search:', error);
  }
}

export async function getRecentSearches(): Promise<SearchedUser[]> {
  try {
    const searchesRef = collection(db, 'searchedusers');
    const q = query(searchesRef);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      ...doc.data(),
      lastSearched: doc.data().lastSearched?.toDate(), // Convert Firestore Timestamp to Date
    })) as SearchedUser[];
  } catch (error) {
    console.error('Error fetching recent searches:', error);
    return [];
  }
}

export async function cacheUserWallet(fid: number, address: string) {
  try {
    const searchesRef = collection(db, 'searchedusers');
    const docRef = doc(searchesRef, fid.toString());
    
    await setDoc(docRef, {
      cachedWallet: {
        address,
        lastUpdated: serverTimestamp()
      }
    }, { merge: true });
  } catch (error) {
    console.error('Error caching wallet:', error);
  }
}

export async function getCachedWallet(fid: number): Promise<string | null> {
  try {
    const searchesRef = collection(db, 'searchedusers');
    const docRef = doc(searchesRef, fid.toString());
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const userData = docSnap.data();
      if (userData.cachedWallet?.address) {
        // Check if cache is less than 24 hours old
        const lastUpdated = userData.cachedWallet.lastUpdated.toDate();
        const isValid = (Date.now() - lastUpdated.getTime()) < 24 * 60 * 60 * 1000;
        
        if (isValid) {
          return userData.cachedWallet.address;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting cached wallet:', error);
    return null;
  }
}

export async function fetchNFTDetails(contractAddress: string, tokenId: string) {
  try {
    const nft = await alchemy.nft.getNftMetadata(
      contractAddress,
      tokenId
    );
    return nft;
  } catch (error) {
    console.error('Error fetching NFT details:', error);
    return null;
  }
}

export async function getTopPlayedNFTs(): Promise<{ nft: NFT; count: number }[]> {
  const nftPlaysRef = collection(db, 'nft_plays');
  const querySnapshot = await getDocs(nftPlaysRef);
  
  const playCount: { [key: string]: { count: number, nft: NFT } } = {};
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const nftKey = data.nftContract.toLowerCase();
    
    if (!playCount[nftKey]) {
      playCount[nftKey] = {
        count: 1,
        nft: {
          contract: data.nftContract,
          tokenId: data.tokenId,
          name: data.name,
          image: data.image,
          audio: data.audioUrl,
          metadata: {
            image: data.image,
            animation_url: data.animationUrl
          }
        }
      };
    } else {
      playCount[nftKey].count++;
    }
  });

  return Object.values(playCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export async function trackNFTPlay(nft: NFT, fid?: number) {
  try {
    let cleanTokenId = nft.tokenId;
    
    if (!cleanTokenId && nft.metadata) {
      // Try to extract from metadata.uri if it exists
      if (nft.metadata.uri) {
        const uriMatch = nft.metadata.uri.match(/\/(\d+)$/);
        if (uriMatch) {
          cleanTokenId = uriMatch[1];
        }
      }
      
      // Try to extract from metadata.animation_url
      if (!cleanTokenId && nft.metadata.animation_url) {
        const animationMatch = nft.metadata.animation_url.match(/\/(\d+)\./);
        if (animationMatch) {
          cleanTokenId = animationMatch[1];
        }
      }
    }

    // If still no tokenId, generate a safe hash
    if (!cleanTokenId) {
      // Use encodeURIComponent to handle special characters
      const safeStr = encodeURIComponent(`${nft.contract}-${nft.name}`);
      cleanTokenId = safeStr.replace(/%/g, '').slice(0, 12);
    }

    // Final validation
    if (!nft.contract || !nft.name) {
      console.warn('Missing required NFT data for tracking.');
      return;
    }

    const nftPlaysRef = collection(db, 'nft_plays');
    await addDoc(nftPlaysRef, {
      nftContract: nft.contract,
      tokenId: cleanTokenId,
      name: nft.name,
      image: nft.image || nft.metadata?.image || '',
      audioUrl: nft.audio || nft.metadata?.animation_url || '',
      animationUrl: nft.metadata?.animation_url || '',
      timestamp: serverTimestamp(),
      playedBy: fid || null, // Add Farcaster ID
    });
    
    console.log('NFT play tracked successfully:', {
      name: nft.name,
      tokenId: cleanTokenId,
      fid: fid || 'anonymous'
    });
  } catch (error) {
    console.error('Error tracking NFT play:', error);
  }
}

export interface NFT {
  contract: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  audio?: string;
  hasValidAudio?: boolean;
  isVideo?: boolean;
  isAnimation?: boolean;
  collection?: {
    name: string;
    image?: string;
  };
  metadata?: {
    image?: string;
    animation_url?: string;
    tokenId?: string;
    uri?: string;
  };
  network?: 'ethereum' | 'base';
}

export async function toggleLikeNFT(nft: NFT, fid: number): Promise<boolean> {
  if (!nft.contract || !nft.tokenId) {
    console.error('Missing required NFT data:', { contract: nft.contract, tokenId: nft.tokenId });
    throw new Error('Invalid NFT data');
  }

  try {
    const user = await ensureFirebaseAuth();
    if (!user) {
      throw new Error('Authentication failed');
    }

    const likesRef = collection(db, 'user_likes');
    const likeId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const likeDoc = doc(likesRef, likeId);
    
    const docSnap = await getDoc(likeDoc);
    
    if (docSnap.exists()) {
      // Unlike
      await deleteDoc(likeDoc);
      return false;
    } else {
      // Like
      await setDoc(likeDoc, {
        fid,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name,
        image: nft.image || nft.metadata?.image || '',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        timestamp: serverTimestamp(),
      });
      return true;
    }
  } catch (error: any) {
    console.error('Error toggling like:', error.code, error.message);
    throw error; // Re-throw the error with more context
  }
}

export async function getLikedNFTs(fid: number): Promise<NFT[]> {
  try {
    const likesRef = collection(db, 'user_likes');
    const q = query(likesRef, where('fid', '==', fid), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name,
        image: data.image,
        audio: data.audioUrl,
        metadata: {
          image: data.image,
          animation_url: data.audioUrl
        }
      };
    });
  } catch (error) {
    console.error('Error getting liked NFTs:', error);
    throw error;
  }
} 