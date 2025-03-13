import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  updateDoc,
  doc,
  increment,
  onSnapshot,
  setDoc,
  getDoc,
  serverTimestamp,
  documentId
} from 'firebase/firestore';
import type { NFT } from '../../types/user';
import { db, firebaseLogger } from './config';
import { getMediaKey } from '../../utils/media';

// Track NFT play and update play count globally
export const trackNFTPlay = async (nft: NFT, fid: number) => {
  try {
    if (!nft) {
      firebaseLogger.error('Invalid NFT provided to trackNFTPlay');
      return;
    }

    if (!fid) {
      firebaseLogger.error('Invalid FID provided to trackNFTPlay');
      return;
    }

    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      firebaseLogger.error('Failed to generate mediaKey for NFT:', nft);
      return;
    }

    firebaseLogger.info(`Tracking play for NFT: ${nft.name || 'Unknown'} with mediaKey: ${mediaKey}`);

    // References to Firebase documents
    const globalPlayRef = doc(db, 'global_plays', mediaKey);
    const userPlayHistoryRef = doc(db, 'users', fid.toString(), 'play_history', mediaKey);
    
    // Get current data for the NFT
    const globalPlayDoc = await getDoc(globalPlayRef);
    
    // Update the global play count
    if (globalPlayDoc.exists()) {
      // Update existing record
      await updateDoc(globalPlayRef, {
        playCount: increment(1),
        lastPlayed: serverTimestamp()
      });
      
      firebaseLogger.info(`Updated existing global play record for ${mediaKey}`);
    } else {
      // Create new record
      await setDoc(globalPlayRef, {
        playCount: 1,
        firstPlayed: serverTimestamp(),
        lastPlayed: serverTimestamp(),
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        description: nft.description || nft.metadata?.description || '',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        imageUrl: nft.image || nft.metadata?.image || '',
        metadata: nft.metadata || {},
        mediaKey
      });
      
      firebaseLogger.info(`Created new global play record for ${mediaKey}`);
    }
    
    // Update the user's play history
    try {
      const userPlayDoc = await getDoc(userPlayHistoryRef);
      
      if (userPlayDoc.exists()) {
        // Update existing record
        await updateDoc(userPlayHistoryRef, {
          playCount: increment(1),
          lastPlayed: serverTimestamp()
        });
      } else {
        // Create new record
        await setDoc(userPlayHistoryRef, {
          playCount: 1,
          firstPlayed: serverTimestamp(),
          lastPlayed: serverTimestamp(),
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || '',
          imageUrl: nft.image || nft.metadata?.image || '',
          metadata: nft.metadata || {},
          mediaKey
        });
      }
      
      firebaseLogger.info(`Updated user play history for user ${fid}, NFT ${mediaKey}`);
    } catch (error) {
      firebaseLogger.error('Error updating user play history:', error);
      // Continue since this is not critical
    }
    
    // Update the top played collection
    try {
      const topPlayedRef = doc(db, 'top_played', mediaKey);
      const topPlayedDoc = await getDoc(topPlayedRef);
      
      if (topPlayedDoc.exists()) {
        // Update existing record
        await updateDoc(topPlayedRef, {
          playCount: increment(1),
          lastPlayed: serverTimestamp()
        });
      } else {
        // Check current count from global plays
        const globalData = globalPlayDoc.exists() 
          ? globalPlayDoc.data() 
          : { playCount: 1 };
        
        // Create new record
        await setDoc(topPlayedRef, {
          playCount: globalData.playCount || 1,
          firstPlayed: serverTimestamp(),
          lastPlayed: serverTimestamp(),
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || '',
          imageUrl: nft.image || nft.metadata?.image || '',
          metadata: nft.metadata || {},
          mediaKey,
          rank: 0  // Will be updated by background process
        });
      }
      
      firebaseLogger.info(`Updated top_played collection for ${mediaKey}`);
    } catch (error) {
      firebaseLogger.error('Error updating top played collection:', error);
      // Continue since this is not critical
    }
    
    // Also update the user's recent plays
    try {
      const recentPlaysRef = doc(db, 'users', fid.toString(), 'recent_plays', mediaKey);
      
      await setDoc(recentPlaysRef, {
        nft: {
          contract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          image: nft.image || nft.metadata?.image || '',
          audio: nft.audio || nft.metadata?.animation_url || '',
          metadata: nft.metadata || {},
          collection: nft.collection || { name: 'Unknown Collection' },
          network: nft.network || 'ethereum',
          isVideo: !!nft.isVideo,
          mediaKey
        },
        timestamp: serverTimestamp(),
        mediaKey
      });
      
      firebaseLogger.info(`Updated recent plays for user ${fid}, NFT ${mediaKey}`);
    } catch (error) {
      firebaseLogger.error('Error updating recent plays:', error);
      // Continue since this is not critical
    }
    
    // Also update or create NFT record in the nfts collection
    try {
      const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
      
      // Check if it exists first
      const nftDoc = await getDoc(nftRef);
      
      if (nftDoc.exists()) {
        // Update existing record
        await updateDoc(nftRef, {
          plays: increment(1),
          lastPlayed: serverTimestamp(),
          mediaKey // Ensure mediaKey is set
        });
      } else {
        // Create new record
        await setDoc(nftRef, {
          contract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          image: nft.image || nft.metadata?.image || '',
          audio: nft.audio || nft.metadata?.animation_url || '',
          metadata: nft.metadata || {},
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          plays: 1,
          likes: 0,
          firstPlayed: serverTimestamp(),
          lastPlayed: serverTimestamp(),
          mediaKey,
          isVideo: !!nft.isVideo
        });
      }
      
      firebaseLogger.info(`Updated nfts collection for ${nft.contract}-${nft.tokenId}`);
    } catch (error) {
      firebaseLogger.error('Error updating nfts collection:', error);
      // Continue since this is not critical
    }
    
    // Return the updated play count
    return {
      success: true,
      mediaKey
    };
  } catch (error) {
    firebaseLogger.error('Error in trackNFTPlay:', error);
    return {
      success: false,
      error
    };
  }
};

// Get top played NFTs from global plays collection
export const getTopPlayedNFTs = async (): Promise<{ nft: NFT; count: number }[]> => {
  try {
    // Get from top_played collection which is pre-ranked
    const topPlayedRef = collection(db, 'top_played');
    const topPlayedQuery = query(
      topPlayedRef,
      orderBy('playCount', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(topPlayedQuery);
    
    if (snapshot.empty) {
      firebaseLogger.info('No top played NFTs found');
      return [];
    }
    
    const topPlayed = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      
      // Construct NFT object from the data
      const nft: NFT = {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name || 'Untitled',
        description: data.description || '',
        image: data.imageUrl || '',
        audio: data.audioUrl || '',
        metadata: data.metadata || {},
        network: 'ethereum', // Default
        isVideo: data.metadata?.animation_url && !data.audioUrl
      };
      
      // If the metadata contains collection info, add it
      if (data.metadata?.collection?.name) {
        nft.collection = {
          name: data.metadata.collection.name,
          image: data.metadata.collection.image
        };
      }
      
      return {
        nft,
        count: data.playCount,
        rank: index + 1
      };
    });
    
    // Also update the rank in Firebase if needed
    for (let i = 0; i < snapshot.docs.length; i++) {
      const docRef = doc(db, 'top_played', snapshot.docs[i].id);
      const currentRank = snapshot.docs[i].data().rank;
      
      // Only update if rank changed
      if (currentRank !== i + 1) {
        updateDoc(docRef, {
          rank: i + 1
        }).catch(err => firebaseLogger.error(`Error updating rank for ${snapshot.docs[i].id}:`, err));
      }
    }
    
    return topPlayed;
  } catch (error) {
    firebaseLogger.error('Error getting top played NFTs:', error);
    return [];
  }
};

// Check if an NFT is currently in the top played section
export const hasBeenTopPlayed = async (nft: NFT | null): Promise<boolean> => {
  if (!nft || !nft.contract || !nft.tokenId) {
    return false;
  }
  
  try {
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      return false;
    }
    
    const topPlayedRef = doc(db, 'top_played', mediaKey);
    const topPlayedDoc = await getDoc(topPlayedRef);
    
    return topPlayedDoc.exists();
  } catch (error) {
    firebaseLogger.error('Error checking if NFT has been top played:', error);
    return false;
  }
};

// Subscribe to recent plays
export const subscribeToRecentPlays = (fid: number, callback: (nfts: NFT[]) => void) => {
  const recentPlaysRef = collection(db, 'users', fid.toString(), 'recent_plays');
  const q = query(
    recentPlaysRef,
    orderBy('timestamp', 'desc'),
    limit(10)
  );
  
  firebaseLogger.info('=== SUBSCRIBING TO RECENT PLAYS ===');
  firebaseLogger.info('FID:', fid);
  
  firebaseLogger.info('Setting up snapshot listener with query:', {
    fid,
    orderBy: 'timestamp',
    direction: 'desc',
    limit: 10
  });
  
  return onSnapshot(q, (snapshot) => {
    firebaseLogger.info('=== RECEIVED RECENT PLAYS UPDATE ===');
    firebaseLogger.info('Number of docs:', snapshot.docs.length);
    
    if (snapshot.empty) {
      firebaseLogger.info('No documents found');
      callback([]);
      return;
    }
    
    const nfts = snapshot.docs.map(doc => {
      const data = doc.data();
      return data.nft;
    });
    
    firebaseLogger.info(`Returning ${nfts.length} recent plays`);
    callback(nfts);
  });
};
