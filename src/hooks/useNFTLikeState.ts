import { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

export const useNFTLikeState = (nft: NFT | null, fid: number) => {
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!nft || !fid) {
      setIsLiked(false);
      setLikesCount(0);
      setIsLoading(false);
      return;
    }

    const mediaKey = getMediaKey(nft);
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
          setLikesCount(data?.likeCount || 0);
        } else {
          setLikesCount(0);
        }
      },
      (error: Error) => {
        console.error('Error listening to global likes:', error);
        setLikesCount(0);
      }
    );

    const unsubscribeUser = onSnapshot(userLikeRef,
      (snapshot: DocumentSnapshot) => {
        setIsLiked(snapshot.exists());
        setIsLoading(false);
      },
      (error: Error) => {
        console.error('Error listening to user like status:', error);
        setIsLiked(false);
        setIsLoading(false);
      }
    );

    // Cleanup listeners when component unmounts or NFT/FID changes
    return () => {
      unsubscribeGlobal();
      unsubscribeUser();
    };
  }, [nft, fid]);

  return { isLiked, likesCount, isLoading };
};
