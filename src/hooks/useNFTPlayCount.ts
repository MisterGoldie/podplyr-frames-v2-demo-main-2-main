import { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

export const useNFTPlayCount = (nft: NFT | null, shouldFetch: boolean = true) => {
  const [playCount, setPlayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip Firebase connection if we shouldn't fetch yet
    if (!shouldFetch || !nft) {
      setPlayCount(0);
      setLoading(false);
      return;
    }

    // Generate mediaKey for content-based tracking
    const mediaKey = getMediaKey(nft);
    if (!mediaKey) {
      console.error('Could not generate mediaKey for NFT:', nft);
      setPlayCount(0);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const globalPlayRef = doc(db, 'global_plays', mediaKey);

    console.log('Listening for play count with mediaKey:', { mediaKey, nft });

    // Set up real-time listener for global play count
    const unsubscribe = onSnapshot(globalPlayRef,
      (snapshot: DocumentSnapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPlayCount(data?.playCount || 0);
          console.log('Updated play count:', { mediaKey, count: data?.playCount || 0 });
        } else {
          setPlayCount(0);
          console.log('No play count found for:', { mediaKey });
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
    return () => {
      console.log('Cleaning up play count listener for:', mediaKey);
      unsubscribe();
    };
  }, [nft, shouldFetch]);

  return { playCount, loading };
};