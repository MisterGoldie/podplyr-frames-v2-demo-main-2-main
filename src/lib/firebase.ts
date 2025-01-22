import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp, orderBy, limit, addDoc } from 'firebase/firestore';
import { Alchemy, Network } from 'alchemy-sdk';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Add error checking for the config
if (!firebaseConfig.projectId) {
  throw new Error('Firebase Project ID is undefined. Check your environment variables.');
}

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

export async function getTopPlayedNFTs() {
  try {
    // First verify we can access the collection
    const testDoc = await getDoc(doc(db, 'nft_plays', 'test'));
    console.log('Firebase access test:', testDoc.exists() ? 'Success' : 'No test document');
    
    const nftPlaysRef = collection(db, 'nft_plays');
    const q = query(
      nftPlaysRef,
      orderBy('timestamp', 'desc'),
      limit(50)  // Reduced limit for better performance
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Query results:', querySnapshot.size, 'documents found');
    
    const playCount: { [key: string]: any } = {};
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const nftKey = `${data.nftContract}-${data.tokenId}`;
      
      if (!playCount[nftKey]) {
        playCount[nftKey] = {
          count: 0,
          contract: data.nftContract,
          tokenId: data.tokenId,
          name: data.name,
          collection: data.collection,
          image: data.image,
          audio: data.audioUrl,
          animationUrl: data.animationUrl
        };
      }
      playCount[nftKey].count++;
    });
    
    const topNFTs = Object.values(playCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(nft => ({
        contract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name,
        collection: nft.collection,
        image: nft.image,
        audio: nft.audio,
        metadata: {
          image: nft.image,
          animation_url: nft.animationUrl
        }
      }));
    
    console.log('Processed top NFTs:', topNFTs.length);
    return topNFTs;
    
  } catch (error) {
    console.error('Error fetching top played NFTs:', error);
    // Return empty array instead of throwing
    return [];
  }
}

export async function trackNFTPlay(nft: NFT) {
  try {
    // Extract tokenId from multiple possible locations
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

    // If still no tokenId, generate a hash from contract + name
    if (!cleanTokenId) {
      cleanTokenId = btoa(`${nft.contract}-${nft.name}`).slice(0, 12);
    }

    // Final validation
    if (!nft.contract || !nft.name) {
      console.warn('Missing required NFT data for tracking. Debug info:', {
        contract: nft.contract,
        name: nft.name,
        generatedId: cleanTokenId
      });
      return;
    }

    const nftPlaysRef = collection(db, 'nft_plays');
    await addDoc(nftPlaysRef, {
      nftContract: nft.contract,
      tokenId: cleanTokenId,
      name: nft.name,
      collection: nft.collection?.name || 'Unknown Collection',
      image: nft.image || nft.metadata?.image || '',
      audioUrl: nft.audio || nft.metadata?.animation_url || '',
      animationUrl: nft.metadata?.animation_url || '',
      timestamp: serverTimestamp()
    });
    
    console.log('NFT play tracked successfully:', {
      name: nft.name,
      tokenId: cleanTokenId
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