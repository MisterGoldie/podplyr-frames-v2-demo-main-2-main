import { useEffect, useState } from 'react';
import type { NFT } from '../types/user';
import { processMediaUrl } from '../utils/media';

export const useNFTPreloader = (nfts: NFT[]) => {
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const preloadImages = async () => {
      setIsLoading(true);
      const imageMap = new Map<string, HTMLImageElement>();

      const preloadPromises = nfts.map(async (nft) => {
        const imageUrl = processMediaUrl(nft.metadata?.image || nft.image || '');
        if (!imageUrl) return;

        const key = `${nft.contract}-${nft.tokenId}`;
        
        // Skip if already preloaded
        if (preloadedImages.has(key)) {
          imageMap.set(key, preloadedImages.get(key)!);
          return;
        }

        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageMap.set(key, img);
            resolve();
          };
          img.onerror = () => {
            resolve(); // Resolve even on error to not block other images
          };
          img.src = imageUrl;
        });
      });

      await Promise.all(preloadPromises);
      setPreloadedImages(imageMap);
      setIsLoading(false);
    };

    preloadImages();
  }, [nfts]);

  const getPreloadedImage = (nft: NFT): HTMLImageElement | undefined => {
    const key = `${nft.contract}-${nft.tokenId}`;
    return preloadedImages.get(key);
  };

  return {
    isLoading,
    getPreloadedImage,
    preloadedImages
  };
};
