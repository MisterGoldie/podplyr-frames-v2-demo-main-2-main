import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';

export const useNFTLikes = (nft: NFT | null) => {
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!nft?.contract || !nft?.tokenId) {
      setLikesCount(0);
      setIsLoading(false);
      return;
    }

    const db = getFirestore();
    const userLikesRef = collection(db, 'user_likes');
    const q = query(
      userLikesRef,
      where('nftContract', '==', nft.contract),
      where('tokenId', '==', nft.tokenId)
    );

    // Set up real-time listener
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
  }, [nft?.contract, nft?.tokenId]);

  return { likesCount, isLoading };
};
