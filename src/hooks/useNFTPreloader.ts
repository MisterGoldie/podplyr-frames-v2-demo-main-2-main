import { useEffect, useState } from 'react';
import type { NFT } from '../types/user';
import { processMediaUrl } from '../utils/media';

const preloadSingleImage = async (nft: NFT, imageMap: Map<string, HTMLImageElement>) => {
  const imageUrl = processMediaUrl(nft.metadata?.image || nft.image || '');
  if (!imageUrl) return;

  const key = `${nft.contract}-${nft.tokenId}`;
  
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
};

export const useNFTPreloader = (nfts: NFT[]) => {
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const preloadImages = async () => {
      setIsLoading(true);
      const imageMap = new Map<string, HTMLImageElement>();

      // Only preload visible NFTs first (first 6 NFTs)
      const visibleNfts = nfts.slice(0, 6);
      const remainingNfts = nfts.slice(6);

      // Copy any already preloaded images
      visibleNfts.forEach(nft => {
        const key = `${nft.contract}-${nft.tokenId}`;
        if (preloadedImages.has(key)) {
          imageMap.set(key, preloadedImages.get(key)!);
        }
      });

      // Preload visible NFTs that haven't been loaded yet
      const unloadedVisibleNfts = visibleNfts.filter(nft => {
        const key = `${nft.contract}-${nft.tokenId}`;
        return !imageMap.has(key);
      });

      await Promise.all(
        unloadedVisibleNfts.map(nft => preloadSingleImage(nft, imageMap))
      );

      // Update state for visible NFTs
      setPreloadedImages(new Map(imageMap));
      setIsLoading(false);

      // Preload remaining NFTs in background
      if (remainingNfts.length > 0) {
        setTimeout(() => {
          Promise.all(
            remainingNfts.map(nft => preloadSingleImage(nft, imageMap))
          ).then(() => {
            setPreloadedImages(new Map(imageMap));
          });
        }, 1000);
      }
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
