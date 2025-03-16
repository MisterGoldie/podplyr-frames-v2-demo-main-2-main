import { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

// Create a logger specifically for like state management
const likeStateLogger = {
  debug: (message: string, ...args: any[]) => console.debug(`[LikeState] ${message}`, ...args),
  info: (message: string, ...args: any[]) => console.info(`[LikeState] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[LikeState] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[LikeState] ${message}`, ...args),
};

export const useNFTLikeState = (nft: NFT | null, fid: number) => {
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  
  // Track the mediaKey to help with debugging
  const mediaKeyRef = useRef<string>('');
  
  // Track subscription status
  const isSubscribedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!nft || !fid) {
      setIsLiked(false);
      setLikesCount(0);
      setIsLoading(false);
      isSubscribedRef.current = false;
      return;
    }

    const mediaKey = getMediaKey(nft);
    mediaKeyRef.current = mediaKey;
    
    likeStateLogger.info('Setting up like state listeners for:', { 
      nftName: nft.name, 
      mediaKey,
      fid
    });
    
    const db = getFirestore();
    
    // Listen to global likes count
    const globalLikeRef = doc(db, 'global_likes', mediaKey);
    // Listen to user's personal like status
    const userLikeRef = doc(db, 'users', fid.toString(), 'likes', mediaKey);

    // Set up real-time listeners
    const unsubscribeGlobal = onSnapshot(globalLikeRef,
      (snapshot: DocumentSnapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const count = data?.likeCount || 0;
          setLikesCount(count);
          likeStateLogger.debug('Global like count updated:', { 
            count, 
            mediaKey,
            nftName: nft.name,
            timestamp: new Date().toISOString()
          });
        } else {
          setLikesCount(0);
          likeStateLogger.debug('No global likes found for:', { mediaKey, nftName: nft.name });
        }
      },
      (error: Error) => {
        likeStateLogger.error('Error listening to global likes:', { error, mediaKey, nftName: nft.name });
        setLikesCount(0);
      }
    );

    const unsubscribeUser = onSnapshot(userLikeRef,
      (snapshot: DocumentSnapshot) => {
        const newLikedState = snapshot.exists();
        setIsLiked(newLikedState);
        setIsLoading(false);
        setLastUpdated(Date.now());
        isSubscribedRef.current = true;
        
        // Log the like state change
        likeStateLogger.info('User like state updated:', { 
          isLiked: newLikedState, 
          mediaKey,
          nftName: nft.name,
          fid,
          timestamp: new Date().toISOString(),
          docExists: snapshot.exists(),
          docId: snapshot.id
        });
        
        // Update DOM elements with this mediaKey to ensure UI consistency
        try {
          document.querySelectorAll(`[data-media-key="${mediaKey}"]`).forEach(element => {
            element.setAttribute('data-liked', newLikedState ? 'true' : 'false');
            likeStateLogger.debug('Updated DOM element with new like state:', { 
              element: element.tagName, 
              mediaKey,
              newState: newLikedState
            });
          });
        } catch (error) {
          likeStateLogger.error('Error updating DOM elements:', error);
        }
      },
      (error: Error) => {
        likeStateLogger.error('Error listening to user like status:', { 
          error, 
          mediaKey, 
          nftName: nft.name,
          fid
        });
        setIsLiked(false);
        setIsLoading(false);
        isSubscribedRef.current = false;
      }
    );

    // Cleanup listeners when component unmounts or NFT/FID changes
    return () => {
      likeStateLogger.debug('Cleaning up like state listeners for:', { 
        mediaKey, 
        nftName: nft?.name,
        fid
      });
      unsubscribeGlobal();
      unsubscribeUser();
      isSubscribedRef.current = false;
    };
  }, [nft, fid]);

  // Add listener for custom like state change events
  // This ensures the hook responds to like state changes from other components
  useEffect(() => {
    if (!nft || !mediaKeyRef.current) return;
    
    const mediaKey = mediaKeyRef.current;
    
    const handleLikeStateChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      
      // Only process events for this NFT
      if (detail.mediaKey === mediaKey || 
          (detail.contract === nft.contract && detail.tokenId === nft.tokenId)) {
        
        // Skip if this event originated from this hook (to avoid loops)
        if (detail.source === 'nft-like-state-hook') return;
        
        likeStateLogger.debug('Received like state change event:', {
          mediaKey,
          isLiked: detail.isLiked,
          nftName: nft.name,
          source: detail.source || 'unknown'
        });
        
        // Update the local state to match the event
        setIsLiked(detail.isLiked);
        setLastUpdated(Date.now());
      }
    };
    
    // Add event listener
    document.addEventListener('nftLikeStateChange', handleLikeStateChange);
    
    // Clean up
    return () => {
      document.removeEventListener('nftLikeStateChange', handleLikeStateChange);
    };
  }, [nft]);
  
  // Return enhanced object with more information
  return { 
    isLiked, 
    likesCount, 
    isLoading,
    lastUpdated,
    mediaKey: mediaKeyRef.current,
    isSubscribed: isSubscribedRef.current
  };
};
