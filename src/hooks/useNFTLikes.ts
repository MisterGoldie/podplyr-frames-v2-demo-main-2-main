import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

export const useNFTLikes = (nft: NFT | null) => {
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!nft) {
      setLikesCount(0);
      setIsLoading(false);
      return;
    }

    // Create mediaKey to group identical NFTs
    const mediaKey = getMediaKey(nft);
    // Encode mediaKey to match document IDs
    const encodedMediaKey = Buffer.from(mediaKey).toString('base64');
    
    const db = getFirestore();
    const userLikesRef = collection(db, 'user_likes');
    const q = query(
      userLikesRef,
      where('mediaKey', '==', encodedMediaKey)
    );

    // Set up real-time listener for all NFTs with same content
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setLikesCount(snapshot.size);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error listening to likes:', error);
        setLikesCount(0);
        setIsLoading(false);
      }
    );

    // Cleanup listener when component unmounts or NFT changes
    return () => unsubscribe();
  }, [nft]);

  return { likesCount, isLoading };
};
