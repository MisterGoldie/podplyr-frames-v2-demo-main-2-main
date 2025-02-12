import { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
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
    const mediaKey = getMediaKey(nft);
    const globalPlayRef = doc(db, 'global_plays', mediaKey);

    // Set up real-time listener for global play count
    const unsubscribe = onSnapshot(globalPlayRef,
      (snapshot: DocumentSnapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPlayCount(data?.playCount || 0);
        } else {
          setPlayCount(0);
        }
        setLoading(false);
      },
      (error: Error) => {
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