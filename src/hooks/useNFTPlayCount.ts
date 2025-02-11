import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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
        
        // First try to get the consolidated count from top_played
        const nftKey = `${nft.contract.toLowerCase()}-${nft.tokenId}`;
        const topPlayedRef = doc(db, 'top_played', nftKey);
        const topPlayedDoc = await getDoc(topPlayedRef);
        
        if (topPlayedDoc.exists()) {
          const data = topPlayedDoc.data();
          setPlayCount(data.totalPlays || 0);
        } else {
          // If not in top_played, get the count from nft_plays
          const nftPlaysRef = collection(db, 'nft_plays');
          const mediaKey = [
            nft.metadata?.animation_url || nft.audio || '',
            nft.image || nft.metadata?.image || '',
            nft.metadata?.animation_url || ''
          ].sort().join('|');

          const q = query(
            nftPlaysRef,
            where('mediaKey', '==', mediaKey)
          );
          
          const querySnapshot = await getDocs(q);
          let totalPlays = 0;
          querySnapshot.forEach(doc => {
            const data = doc.data();
            totalPlays += data.playCount || 1;
          });
          setPlayCount(totalPlays);
        }
      } catch (error) {
        console.error('Error fetching play count:', error);
        setPlayCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayCount();
  }, [nft?.contract, nft?.tokenId, nft?.metadata?.animation_url, nft?.audio, nft?.image, nft?.metadata?.image]);

  return { playCount, loading };
};