import { useEffect, useState, useCallback, useRef } from 'react';
import type { NFT } from '../types/user';
import { getMediaKey } from '../utils/media';

// Network speed detection
const detectNetworkSpeed = () => {
  if ('connection' in navigator) {
    const conn = (navigator as any).connection;
    if (conn.effectiveType) {
      return conn.effectiveType as '4g' | '3g' | 'slow-3g';
    }
  }
  return '4g';
};

const preloadSingleImage = async (nft: NFT, imageMap: Map<string, HTMLImageElement>) => {
  // Use the original URL without any processing
  const imageUrl = nft.metadata?.image || nft.image || '';
  if (!imageUrl) return;

  const key = getMediaKey(nft);
  
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageMap.set(key, img);
      resolve();
    };
    img.onerror = () => {
      console.warn('Failed to preload image for NFT:', nft.name);
      resolve(); // Resolve even on error to not block other images
    };
    img.src = imageUrl;
  });
};

const preloadBatch = async (nfts: NFT[], imageMap: Map<string, HTMLImageElement> = new Map()) => {
  await Promise.all(nfts.map(nft => preloadSingleImage(nft, imageMap)));
  return imageMap;
};

export const useNFTPreloader = (nfts: NFT[]) => {
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [networkType, setNetworkType] = useState<'4g' | '3g' | 'slow-3g'>('4g');
  const [loadedCount, setLoadedCount] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageMapRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Determine batch size based on network speed
  const batchSize = networkType === '4g' ? 6 : 3;

  // Network speed detection
  useEffect(() => {
    const updateNetworkType = () => {
      setNetworkType(detectNetworkSpeed());
    };

    updateNetworkType();
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', updateNetworkType);
      return () => {
        (navigator as any).connection.removeEventListener('change', updateNetworkType);
      };
    }
  }, []);

  // Progressive loading with Intersection Observer
  const loadMoreOnScroll = useCallback(async () => {
    if (loadedCount >= nfts.length) return;
    
    const nextBatch = nfts.slice(loadedCount, loadedCount + batchSize);
    const updatedMap = await preloadBatch(nextBatch, imageMapRef.current);
    imageMapRef.current = updatedMap;
    setPreloadedImages(new Map(updatedMap));
    setLoadedCount(prev => prev + batchSize);
  }, [loadedCount, nfts, batchSize]);

  // Initialize Intersection Observer
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreOnScroll();
        }
      },
      { threshold: 0.5 }
    );

    observerRef.current.observe(containerRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMoreOnScroll]);

  // Preload initial batch
  useEffect(() => {
    const preloadInitialBatch = async () => {
      setIsLoading(true);
      const initialBatch = nfts.slice(0, batchSize);
      
      // Preload initial batch
      const updatedMap = await preloadBatch(initialBatch, imageMapRef.current);
      imageMapRef.current = updatedMap;
      setPreloadedImages(new Map(updatedMap));
      setLoadedCount(batchSize);
      setIsLoading(false);
    };

    preloadInitialBatch();

    // Cleanup function
    return () => {
      imageMapRef.current.clear();
      setPreloadedImages(new Map());
      setLoadedCount(0);
    };
  }, [nfts, batchSize]);

  const getPreloadedImage = (nft: NFT): HTMLImageElement | undefined => {
    const key = getMediaKey(nft);
    return preloadedImages.get(key);
  };

  const preloadImage = useCallback((nft: NFT) => {
    // Use the original URL without any processing
    const imageUrl = nft.image || nft.metadata?.image;
    if (!imageUrl) return;
    
    // Create a key for this NFT
    const key = `${nft.contract}-${nft.tokenId}`;
    
    // Skip if already preloaded
    if (preloadedImages.has(key)) return;
    
    // Create a new image element
    const img = new Image();
    
    // Set the source to preload - use original URL
    img.src = imageUrl;
    
    // Store the preloaded image
    img.onload = () => {
      setPreloadedImages(prev => {
        const newMap = new Map(prev);
        newMap.set(key, img);
        return newMap;
      });
    };
    
    img.onerror = () => {
      console.warn('Failed to preload image in preloadImage for NFT:', nft.name);
    };
  }, [preloadedImages]);

  return {
    isLoading,
    getPreloadedImage,
    preloadedImages,
    preloadImage
  };
};
