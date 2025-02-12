import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

export const useNFTPlayCount = (nft: NFT | null) => {
  const [playCount, setPlayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nft) {
      setPlayCount(0);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const nftPlaysRef = collection(db, 'nft_plays');
    const mediaKey = getMediaKey(nft);

    // Set up real-time listener for play count updates
    const q = query(
      nftPlaysRef,
      where('mediaKey', '==', mediaKey)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        let totalPlays = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          totalPlays += data.playCount || 1;
        });
        setPlayCount(totalPlays);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to play count:', error);
        setPlayCount(0);
        setLoading(false);
      }
    );

    // Cleanup listener when component unmounts or NFT changes
    return () => unsubscribe();
  }, [nft]);

  return { playCount, loading };
};