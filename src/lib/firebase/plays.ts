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
  addDoc,
  serverTimestamp,
  documentId,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import type { NFT } from '../../types/user';
import { db, firebaseLogger } from './config';
import { getMediaKey } from '../../utils/media';

// Track NFT play and update play count globally
export const trackNFTPlay = async (nft: NFT, fid: number) => {
  firebaseLogger.info(`TRACKING PLAY FOR NFT BY FARCASTER USER ${fid} - USING ORIGINAL METHOD`);
  try {
    if (!nft || !fid) {
      firebaseLogger.error('Invalid NFT or FID');
      return { success: false, error: 'Invalid NFT or FID' };
    }

    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      firebaseLogger.error('Failed to get mediaKey');
      return { success: false, error: 'Failed to get mediaKey' };
    }
    
    firebaseLogger.info(`Generated mediaKey: ${mediaKey}`);

    // STEP 1: Update global play count (this part always works)
    // Create timestamps for consistency across collections
    const now = Date.now(); // Current time in milliseconds
    const nowISO = new Date(now).toISOString();
    
    const globalPlayRef = doc(db, 'global_plays', mediaKey);
    const globalPlayDoc = await getDoc(globalPlayRef);
    
    if (globalPlayDoc.exists()) {
      await updateDoc(globalPlayRef, {
        playCount: increment(1),
        lastPlayed: serverTimestamp(),
        lastPlayedTimestamp: now,
        lastPlayedISO: nowISO
      });
      firebaseLogger.info(`Updated existing global play record`);
    } else {
      await setDoc(globalPlayRef, {
        playCount: 1,
        firstPlayed: serverTimestamp(),
        firstPlayedTimestamp: now,
        firstPlayedISO: nowISO,
        lastPlayed: serverTimestamp(),
        lastPlayedTimestamp: now,
        lastPlayedISO: nowISO,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        imageUrl: nft.image || nft.metadata?.image || '',
        description: nft.description || nft.metadata?.description || '',
        mediaKey
      });
      firebaseLogger.info(`Created new global play record`);
    }
    
    // STEP 2: Create user document if needed
    const userRef = doc(db, 'users', fid.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Create new user document
      await setDoc(userRef, {
        fid: fid,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        hasPlayHistory: true
      });
      firebaseLogger.info(`Created new user document for FID ${fid}`);
    } else {
      // Update existing user
      await updateDoc(userRef, {
        lastActive: serverTimestamp(),
        hasPlayHistory: true
      });
      firebaseLogger.info(`Updated existing user document for FID ${fid}`);
    }
    
    // STEP 3: Create play history entry - THIS IS THE PART THAT WAS BROKEN
    // THE CRITICAL DIFFERENCE: Use collection() and addDoc() instead of doc() and setDoc()
    try {
      // Get a reference to the playHistory collection (NOT a specific document)
      const playHistoryRef = collection(db, 'users', fid.toString(), 'playHistory');
      
      firebaseLogger.info(`CREATING a new document in playHistory collection for user ${fid} with generated ID`);
      
      const playHistoryData = {
        playCount: 1,
        // Use both timestamps - one for server consistency, one for immediate display
        serverTimestamp: serverTimestamp(), // Will be resolved on server
        timestamp: now, // Actual numerical value for immediate display
        timestampISO: nowISO, // Human-readable format
        mediaKey: mediaKey,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name || 'Untitled',
        description: nft.description || nft.metadata?.description || '',
        audioUrl: nft.audio || nft.metadata?.animation_url || '',
        image: nft.image || nft.metadata?.image || '',
        collection: nft.collection?.name || 'Unknown Collection',
        network: nft.network || 'ethereum',
        fid: fid
      };
      
      // Add a NEW document with an auto-generated ID
      const newDoc = await addDoc(playHistoryRef, playHistoryData);
      
      firebaseLogger.info(`SUCCESS! Created playHistory document with ID: ${newDoc.id}`);
      
      // STEP 4: Update recent plays collection
      try {
        // Get a reference to the recentPlays collection
        const recentPlaysRef = collection(db, 'users', fid.toString(), 'recentPlays');
        
        firebaseLogger.info(`Creating recentPlays document for user ${fid}`);
        
        // Create recent plays data with the same timestamp approach
        const recentPlaysData = {
          timestamp: now,
          timestampISO: nowISO,
          serverTimestamp: serverTimestamp(),
          mediaKey: mediaKey,
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || nft.metadata?.description || '',
          audioUrl: nft.audio || nft.metadata?.animation_url || '',
          image: nft.image || nft.metadata?.image || '',
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          fid: fid
        };
        
        // Add a NEW document with an auto-generated ID
        const recentDoc = await addDoc(recentPlaysRef, recentPlaysData);
        
        firebaseLogger.info(`SUCCESS! Created recentPlays document with ID: ${recentDoc.id}`);
      } catch (recentPlaysError) {
        firebaseLogger.error(`Error creating recentPlays document: ${recentPlaysError}`);
        // Continue since this isn't critical
      }
    } catch (playHistoryError) {
      firebaseLogger.error(`CRITICAL: Play history creation failed: ${playHistoryError}`);
    }
    
    return { success: true, mediaKey };
  } catch (error) {
    firebaseLogger.error(`CRITICAL ERROR: ${error}`);
    return { success: false, error };
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
