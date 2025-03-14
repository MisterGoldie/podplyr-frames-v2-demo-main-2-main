import { 
  collection, 
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
  DocumentSnapshot,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import type { NFT } from '../../types/user';
import { db, firebaseLogger } from './config';
import { getMediaKey } from '../../utils/media';

// Clean up old likes and migrate to new format
export const cleanupLikes = async (fid: number) => {
  try {
    // Check if user exists
    if (!fid) {
      firebaseLogger.error('Invalid FID provided to cleanupLikes');
      return;
    }
    
    // Get the user document first
    const userRef = doc(db, 'users', fid.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      firebaseLogger.warn(`User ${fid} does not exist, skipping cleanup`);
      return;
    }
    
    const userData = userDoc.data();
    
    // Check if we have old style liked_nfts array
    if (userData.liked_nfts && Array.isArray(userData.liked_nfts) && userData.liked_nfts.length > 0) {
      firebaseLogger.info(`Found ${userData.liked_nfts.length} NFTs in old liked_nfts array for user ${fid}`);
      
      // Create a batch for efficiency
      const batch = writeBatch(db);
      
      // Add all the old format NFTs to the new collection
      for (const nft of userData.liked_nfts) {
        // Only process valid NFTs
        if (nft && nft.contract && nft.tokenId) {
          try {
            // Create a document ID with consistent format
            const likeId = `${fid}-${nft.contract}-${nft.tokenId}`;
            const likeRef = doc(db, 'user_likes', likeId);
            
            // Create like document
            batch.set(likeRef, {
              fid,
              contract: nft.contract,
              tokenId: nft.tokenId,
              name: nft.name || 'Untitled',
              description: nft.description || '',
              image: nft.image || '',
              audioUrl: nft.audio || nft.metadata?.animation_url || '',
              collection: nft.collection?.name || 'Unknown Collection',
              network: nft.network || 'ethereum',
              timestamp: serverTimestamp()
            });
            
            firebaseLogger.info(`Added ${nft.name || 'Unknown NFT'} to user_likes with ID ${likeId}`);
          } catch (error) {
            firebaseLogger.error(`Error processing NFT ${nft.contract}-${nft.tokenId}:`, error);
            // Continue with the next NFT
          }
        }
      }
      
      // Remove the liked_nfts array from the user document
      batch.update(userRef, {
        liked_nfts: []
      });
      
      // Commit the batch
      await batch.commit();
      firebaseLogger.info(`Successfully migrated ${userData.liked_nfts.length} NFTs from old format for user ${fid}`);
    } else {
      firebaseLogger.info(`No old format likes found for user ${fid}`);
    }
    
    // Return success
    return {
      success: true
    };
  } catch (error) {
    firebaseLogger.error('Error in cleanupLikes:', error);
    return {
      success: false,
      error
    };
  }
};

// Get liked NFTs for a user
export const getLikedNFTs = async (fid: number): Promise<NFT[]> => {
  try {
    // Check if we need to clean up old likes
    await cleanupLikes(fid);
    
    // Get user's likes from the likes subcollection
    const likesRef = collection(db, 'users', fid.toString(), 'likes');
    const q = query(likesRef, orderBy('timestamp', 'asc')); // Newest first
    
    firebaseLogger.info(`Getting liked NFTs for user ${fid}`);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      firebaseLogger.info(`No liked NFTs found for user ${fid}`);
      return [];
    }
    
    // Transform the documents into NFT objects
    let likedNFTs: NFT[] = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Construct the NFT object
      const nft: NFT = {
        contract: data.nftContract,
        tokenId: data.tokenId,
        name: data.name || 'Untitled',
        description: data.description || '',
        image: data.image || '',
        audio: data.audioUrl || '',
        collection: data.collection ? { name: data.collection } : undefined,
        network: data.network || 'ethereum',
        mediaKey: data.mediaKey,
        metadata: data.metadata || {} // Optional metadata
      };
      
      // If we have a nested nft object, prioritize those values
      if (data.nft) {
        Object.assign(nft, {
          contract: data.nft.contract || nft.contract,
          tokenId: data.nft.tokenId || nft.tokenId,
          name: data.nft.name || nft.name,
          description: data.nft.description || nft.description,
          image: data.nft.image || nft.image,
          audio: data.nft.audio || nft.audio,
          metadata: data.nft.metadata || nft.metadata
        });
        
        if (data.nft.collection) {
          nft.collection = {
            name: data.nft.collection.name || (typeof data.nft.collection === 'string' ? data.nft.collection : 'Unknown Collection'),
            image: data.nft.collection.image
          };
        }
      }
      
      // Fill in collection if available from metadata
      if (!nft.collection && data.metadata?.collection) {
        nft.collection = {
          name: data.metadata.collection.name || 'Unknown Collection',
          image: data.metadata.collection.image
        };
      }
      
      // Determine if this is a video NFT
      if (nft.metadata?.animation_url && typeof nft.metadata.animation_url === 'string') {
        const animUrl = nft.metadata.animation_url.toLowerCase();
        if (
          animUrl.endsWith('.mp4') || 
          animUrl.endsWith('.webm') || 
          animUrl.endsWith('.mov') ||
          animUrl.includes('/ipfs/') && !animUrl.includes('.mp3') && !animUrl.includes('.wav')
        ) {
          nft.isVideo = true;
        }
      }
      
      // Special case for YouTube links
      // Check for YouTube links in metadata properties
      const externalUrl = nft.metadata?.properties?.['external_url'] || '';
      if (typeof externalUrl === 'string' && externalUrl) {
        const externalUrlLower = externalUrl.toLowerCase();
        if (externalUrlLower.includes('youtube.com') || externalUrlLower.includes('youtu.be')) {
          nft.isVideo = true;
        }
      }
      
      return nft;
    });
    
    // Check if we also need to get old format likes
    const userRef = doc(db, 'users', fid.toString());
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.liked_nfts && Array.isArray(userData.liked_nfts) && userData.liked_nfts.length > 0) {
        // Add these to our results
        likedNFTs = [...likedNFTs, ...userData.liked_nfts];
        
        // Schedule a cleanup
        setTimeout(() => {
          cleanupLikes(fid).catch(err => 
            firebaseLogger.error(`Background cleanup failed for user ${fid}:`, err)
          );
        }, 2000);
      }
    }
    
    // Also check user_likes global collection (newer format)
    const userLikesQuery = query(
      collection(db, 'user_likes'),
      where(documentId(), '>=', `${fid}-`),
      where(documentId(), '<', `${fid.toString()}z`)
    );
    
    const userLikesSnapshot = await getDocs(userLikesQuery);
    
    if (!userLikesSnapshot.empty) {
      firebaseLogger.info(`Found ${userLikesSnapshot.docs.length} NFTs in user_likes collection for user ${fid}`);
      
      const globalLikedNFTs = userLikesSnapshot.docs.map(doc => {
        const data = doc.data();
        
        return {
          contract: data.contract,
          tokenId: data.tokenId,
          name: data.name || 'Untitled',
          description: data.description || '',
          image: data.image || '',
          audio: data.audioUrl || '',
          collection: { name: data.collection || 'Unknown Collection' },
          network: data.network || 'ethereum'
        } as NFT;
      });
      
      // Add these to our results
      likedNFTs = [...likedNFTs, ...globalLikedNFTs];
    }
    
    // Deduplicate NFTs by contract-tokenId
    const uniqueNFTs = new Map<string, NFT>();
    
    for (const nft of likedNFTs) {
      if (nft && nft.contract && nft.tokenId) {
        const key = `${nft.contract}-${nft.tokenId}`;
        
        // Only add if not already in the map or if this one has more complete data
        if (!uniqueNFTs.has(key) || 
            (!uniqueNFTs.get(key)?.name && nft.name) || 
            (!uniqueNFTs.get(key)?.image && nft.image)) {
          uniqueNFTs.set(key, nft);
        }
      }
    }
    
    likedNFTs = Array.from(uniqueNFTs.values());
    
    // Check for permanently removed likes
    const removedRef = collection(db, 'users', fid.toString(), 'removed_likes');
    const removedSnapshot = await getDocs(removedRef);
    
    if (!removedSnapshot.empty) {
      const removedMediaKeys = new Set<string>();
      const removedContractTokenIds = new Set<string>();
      
      // Collect all removed mediaKeys and contract-tokenId combinations
      removedSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.mediaKey) {
          removedMediaKeys.add(data.mediaKey);
        }
        if (data.nftContract && data.tokenId) {
          removedContractTokenIds.add(`${data.nftContract}-${data.tokenId}`);
        }
      });
      
      // Filter out permanently removed NFTs
      likedNFTs = likedNFTs.filter(nft => {
        const contractTokenId = `${nft.contract}-${nft.tokenId}`;
        // Keep only if not in either removal list
        return !(
          (nft.mediaKey && removedMediaKeys.has(nft.mediaKey)) || 
          removedContractTokenIds.has(contractTokenId)
        );
      });
    }
    
    firebaseLogger.info(`Processed ${likedNFTs.length} liked NFTs after deduplication`);
    return likedNFTs;
  } catch (error) {
    firebaseLogger.error('Error getting liked NFTs:', error);
    return [];
  }
};

// Toggle NFT like status globally
export const toggleLikeNFT = async (nft: NFT, fid: number): Promise<boolean> => {
  firebaseLogger.info('Starting toggleLikeNFT with NFT:', nft.name, 'and fid:', fid);
  
  if (!fid || fid <= 0) {
    firebaseLogger.error('Invalid fid provided to toggleLikeNFT:', fid);
    return false; // Return false instead of throwing to avoid breaking the UI
  }
  
  if (!nft || !nft.contract || !nft.tokenId) {
    firebaseLogger.error('Invalid NFT data provided to toggleLikeNFT:', nft);
    return false; // Return false instead of throwing to avoid breaking the UI
  }
  
  try {
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      firebaseLogger.error('Invalid mediaKey for NFT:', nft);
      return false;
    }
    
    firebaseLogger.info('Using mediaKey for like operation:', mediaKey);
    
    // Reference to global likes document
    const globalLikeRef = doc(db, 'global_likes', mediaKey);
    const userLikeRef = doc(db, 'users', fid.toString(), 'likes', mediaKey);
    
    firebaseLogger.info('Document references created:', {
      globalLikeRef: globalLikeRef.path,
      userLikeRef: userLikeRef.path
    });
    
    // Get both documents in parallel for efficiency
    firebaseLogger.info('Fetching existing documents...');
    let userLikeDoc, globalLikeDoc;
    try {
      [userLikeDoc, globalLikeDoc] = await Promise.all([
        getDoc(userLikeRef),
        getDoc(globalLikeRef)
      ]);
    } catch (error) {
      firebaseLogger.error('Error fetching documents:', error);
      return false; // Return false instead of throwing to avoid breaking the UI
    }
    
    firebaseLogger.info('Document fetch complete. User like exists:', userLikeDoc.exists(), 'Global like exists:', globalLikeDoc.exists());
    
    const batch = writeBatch(db);
    
    if (userLikeDoc.exists()) {
      // UNLIKE FLOW - Remove like from user's likes
      firebaseLogger.info('User like exists - removing like');
      batch.delete(userLikeRef);
      
      // Add to permanent removal list for this user
      const permanentRemovalRef = doc(db, 'users', fid.toString(), 'removed_likes', mediaKey);
      batch.set(permanentRemovalRef, {
        mediaKey,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        removedAt: serverTimestamp()
      });
      firebaseLogger.info(`Added ${nft.name} (${mediaKey}) to permanent removal list for user ${fid}`);
      
      if (globalLikeDoc.exists()) {
        try {
          // Get accurate count of users who currently like this NFT without using collection group query
          firebaseLogger.info('Finding other users who like this NFT...');
          let actualLikeCount = 0;
          
          // Query all users collections to check who has this mediaKey in their likes
          const usersRef = collection(db, 'users');
          const usersSnapshot = await getDocs(usersRef);
          
          // Check each user's likes collection for this mediaKey
          const checkLikePromises = [];
          for (const userDoc of usersSnapshot.docs) {
            // Skip the current user as we're already removing their like
            if (userDoc.id === fid.toString()) continue;
            
            const checkLikePromise = (async () => {
              try {
                const userLikeDocRef = doc(db, 'users', userDoc.id, 'likes', mediaKey);
                const userLikeSnapshot = await getDoc(userLikeDocRef);
                if (userLikeSnapshot.exists()) {
                  return true;
                }
                return false;
              } catch (e) {
                firebaseLogger.error(`Error checking like for user ${userDoc.id}:`, e);
                return false;
              }
            })();
            
            checkLikePromises.push(checkLikePromise);
          }
          
          // Wait for all checks to complete and count likes
          const userLikeResults = await Promise.all(checkLikePromises);
          actualLikeCount = userLikeResults.filter(Boolean).length;
          
          firebaseLogger.info(`Actual users liking this NFT (excluding current user): ${actualLikeCount}`);
          if (actualLikeCount <= 0) {
            // If no other users like this NFT, delete the global document
            firebaseLogger.info('No other users like this NFT, deleting global document');
            batch.delete(globalLikeRef);
          } else {
            // Otherwise update with the accurate count
            firebaseLogger.info('Updating global like count to:', actualLikeCount);
            batch.update(globalLikeRef, {
              likeCount: actualLikeCount,
              lastUnliked: serverTimestamp()
            });
          }
        } catch (error) {
          firebaseLogger.error('Error counting other user likes:', error);
          // Safer fallback: decrement count by 1
          const globalData = globalLikeDoc.data();
          const currentCount = globalData?.likeCount || 1;
          if (currentCount <= 1) {
            batch.delete(globalLikeRef);
          } else {
            batch.update(globalLikeRef, {
              likeCount: currentCount - 1,
              lastUnliked: serverTimestamp()
            });
          }
        }
      }

      // Update likes count in nfts collection if it exists
      try {
        const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
        const nftDoc = await getDoc(nftRef);
        if (nftDoc.exists()) {
          const currentLikes = nftDoc.data()?.likes || 1;
          batch.update(nftRef, {
            likes: Math.max(0, currentLikes - 1)
          });
        }
      } catch (error) {
        firebaseLogger.error('Error updating nft document, continuing anyway:', error);
        // Non-critical, can continue without this update
      }
      
      // Commit the batch operations
      try {
        await batch.commit();
        firebaseLogger.info('Successfully removed like for:', mediaKey);
        return false; // Return false to indicate NFT is not liked
      } catch (error) {
        firebaseLogger.error('Error committing unlike operation:', error);
        return userLikeDoc.exists(); // Return previous state on error
      }
    } else {
      // LIKE FLOW - Add NFT to user's likes
      firebaseLogger.info('User like does not exist - adding like');
      
      try {
        // Store NFT data in the user like document
        const userLikeData = {
          mediaKey,
          nft: {
            contract: nft.contract,
            tokenId: nft.tokenId,
            name: nft.name || 'Untitled',
            description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
            image: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
            audio: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
            metadata: nft.metadata || {}
          },
          nftContract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
          image: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
          audioUrl: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          timestamp: serverTimestamp()
        };
        
        // We want to store only essential NFT data, excluding duplicative or derived fields
        const sanitizedUserLikeData = JSON.parse(JSON.stringify(userLikeData));
        
        batch.set(userLikeRef, sanitizedUserLikeData);
        
        if (globalLikeDoc.exists()) {
          // Update existing global like document
          const globalData = globalLikeDoc.data();
          batch.update(globalLikeRef, {
            likeCount: (globalData.likeCount || 0) + 1,
            lastLiked: serverTimestamp()
          });
        } else {
          // Create new global like document
          batch.set(globalLikeRef, {
            likeCount: 1,
            nftContract: nft.contract,
            tokenId: nft.tokenId,
            name: nft.name || 'Untitled',
            description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
            imageUrl: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
            audioUrl: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
            metadata: nft.metadata || {},
            firstLiked: serverTimestamp(),
            lastLiked: serverTimestamp(),
            mediaKey
          });
        }
        
        // Also add to the global user_likes collection for consistency
        const globalUserLikeRef = doc(db, 'user_likes', `${fid}-${nft.contract}-${nft.tokenId}`);
        batch.set(globalUserLikeRef, {
          fid,
          contract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name || 'Untitled',
          description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
          image: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
          audioUrl: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
          collection: nft.collection?.name || 'Unknown Collection',
          network: nft.network || 'ethereum',
          timestamp: serverTimestamp()
        });
        
        // Update likes count in nfts collection if it exists
        try {
          const nftRef = doc(db, 'nfts', `${nft.contract}-${nft.tokenId}`);
          const nftDoc = await getDoc(nftRef);
          if (nftDoc.exists()) {
            batch.update(nftRef, {
              likes: increment(1)
            });
          } else {
            // Create NFT doc if it doesn't exist
            batch.set(nftRef, {
              contract: nft.contract,
              tokenId: nft.tokenId,
              name: nft.name || 'Untitled',
              description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
              image: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
              audio: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
              metadata: nft.metadata || {},
              collection: nft.collection?.name || 'Unknown Collection',
              network: nft.network || 'ethereum',
              likes: 1,
              plays: 0,
              mediaKey
            });
          }
        } catch (error) {
          firebaseLogger.error('Error preparing nft document update, continuing anyway:', error);
          // Non-critical, can continue without this update
        }
        
        // Remove from permanent removal list if it exists
        try {
          const permanentRemovalRef = doc(db, 'users', fid.toString(), 'removed_likes', mediaKey);
          const removalDoc = await getDoc(permanentRemovalRef);
          if (removalDoc.exists()) {
            batch.delete(permanentRemovalRef);
            firebaseLogger.info(`Removed ${nft.name} (${mediaKey}) from permanent removal list for user ${fid}`);
          }
        } catch (error) {
          firebaseLogger.error('Error checking permanent removal list, continuing anyway:', error);
          // Non-critical, can continue without this update
        }
        
        // Commit all the changes in the batch
        await batch.commit();
        firebaseLogger.info('Successfully added like for:', mediaKey);
        return true; // Return true to indicate NFT is liked
      } catch (error) {
        firebaseLogger.error('Error in like operation:', error);
        return false; // Return false on error
      }
    }
  } catch (error) {
    firebaseLogger.error('Error in toggleLikeNFT:', error);
    return false; // Return false on error
  }
};

// Add NFT to user's liked collection
export const addLikedNFT = async (fid: number, nft: NFT): Promise<void> => {
  try {
    const likeId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const likeRef = doc(db, 'user_likes', likeId);
    
    await setDoc(likeRef, {
      fid,
      contract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name || 'Untitled',
      description: nft.description || (typeof nft.metadata?.description === 'string' ? nft.metadata.description : '') || '',
      image: nft.image || (typeof nft.metadata?.image === 'string' ? nft.metadata.image : '') || '',
      audioUrl: nft.audio || (typeof nft.metadata?.animation_url === 'string' ? nft.metadata.animation_url : '') || '',
      collection: nft.collection?.name || 'Unknown Collection',
      network: nft.network || 'ethereum',
      timestamp: serverTimestamp()
    });
    
    firebaseLogger.info(`Added NFT to likes: ${likeId}`);
  } catch (error) {
    firebaseLogger.error('Error adding liked NFT:', error);
    throw error;
  }
};

// Remove NFT from user's liked collection
export const removeLikedNFT = async (fid: number, nft: NFT): Promise<void> => {
  try {
    const likeId = `${fid}-${nft.contract}-${nft.tokenId}`;
    const likeRef = doc(db, 'user_likes', likeId);
    
    await deleteDoc(likeRef);
    
    firebaseLogger.info(`Removed NFT from likes: ${likeId}`);
  } catch (error) {
    firebaseLogger.error('Error removing liked NFT:', error);
    throw error;
  }
};
