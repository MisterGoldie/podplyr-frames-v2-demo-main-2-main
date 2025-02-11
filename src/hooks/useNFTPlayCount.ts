import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import type { NFT } from '../types/user';

export const useNFTPlayCount = (nft: NFT | null) => {
  const [playCount, setPlayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayCount = async () => {
      if (!nft?.contract || !nft?.tokenId) {
        setPlayCount(0);
        setLoading(false);
        return;
      }

      try {
        const db = getFirestore();
        const nftPlaysRef = collection(db, 'nft_plays');
        const q = query(
          nftPlaysRef,
          where('nftContract', '==', nft.contract),
          where('tokenId', '==', nft.tokenId)
        );
        
        const querySnapshot = await getDocs(q);
        const count = querySnapshot.size;
        setPlayCount(count);
      } catch (error) {
        console.error('Error fetching play count:', error);
        setPlayCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayCount();
  }, [nft?.contract, nft?.tokenId]);

  return { playCount, loading };
};
