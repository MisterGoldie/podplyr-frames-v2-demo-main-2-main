import { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

export const useTopPlayedNFTs = () => {
  const [topPlayed, setTopPlayed] = useState<{ nft: NFT; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestore();
    const globalPlaysRef = collection(db, 'global_plays');
    const q = query(
      globalPlaysRef,
      orderBy('playCount', 'desc'),
      limit(10) // Get more than we need to account for duplicates
    );

    // Set up real-time listener for top played NFTs
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const topPlayedNFTs: { nft: NFT; count: number }[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.mediaKey || !data.nftContract || !data.tokenId) return;

        // Create NFT object from global_plays data
        const nft: NFT = {
          contract: data.nftContract,
          tokenId: data.tokenId,
          name: data.name || 'Untitled NFT',
          description: data.description || '',
          image: data.image || '',
          audio: data.audioUrl,
          hasValidAudio: Boolean(data.audioUrl),
          metadata: {
            name: data.name || 'Untitled NFT',
            description: data.description || '',
            image: data.image || '',
            animation_url: data.audioUrl
          },
          collection: {
            name: data.collection || 'Unknown Collection'
          },
          network: data.network || 'ethereum'
        };

        topPlayedNFTs.push({
          nft,
          count: data.playCount || 0
        });
      });

      // Deduplicate by mediaKey, keeping highest play count
      const mediaKeyMap = new Map<string, { nft: NFT; count: number }>();
      topPlayedNFTs.forEach(item => {
        const mediaKey = getMediaKey(item.nft);
        if (!mediaKey) return;
        
        const existing = mediaKeyMap.get(mediaKey);
        if (!existing || item.count > existing.count) {
          mediaKeyMap.set(mediaKey, item);
        }
      });

      // Convert back to array, sort by play count, and take top 3
      const uniqueTopPlayed = Array.from(mediaKeyMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      setTopPlayed(uniqueTopPlayed);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { topPlayed, loading };
};
