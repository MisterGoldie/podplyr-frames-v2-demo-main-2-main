import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import type { NFT } from '../types/user';

export const useNFTLikes = (nft: NFT | null) => {
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLikesCount = async () => {
      if (!nft?.contract || !nft?.tokenId) {
        setLikesCount(0);
        setIsLoading(false);
        return;
      }

      try {
        const db = getFirestore();
        const userLikesRef = collection(db, 'user_likes');
        const q = query(
          userLikesRef,
          where('nftContract', '==', nft.contract),
          where('tokenId', '==', nft.tokenId)
        );

        const querySnapshot = await getDocs(q);
        const count = querySnapshot.size;
        setLikesCount(count);
      } catch (error) {
        console.error('Error fetching likes count:', error);
        setLikesCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLikesCount();
  }, [nft?.contract, nft?.tokenId]);

  return { likesCount, isLoading };
};
