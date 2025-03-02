import { useState, useEffect, useCallback } from 'react';
import { NFT } from '../types/user';

const INITIAL_LOAD = 20;
const BATCH_SIZE = 12;
const THRESHOLD = 400; // pixels from bottom to trigger load

// Create an interface that extends NFT with a truly unique random ID for React keys
interface IndexedNFT extends NFT {
  _uniqueReactId: string; // Guaranteed unique random ID for React keys
}

// Generate a random string that's guaranteed to be unique
const generateUniqueId = (): string => {
  return `id_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
};

export const useVirtualizedNFTs = (allNFTs: NFT[]) => {
  const [visibleNFTs, setVisibleNFTs] = useState<IndexedNFT[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Initialize with first batch and reset loading state
  useEffect(() => {
    // Add a completely random unique ID to each NFT for guaranteed unique React keys
    const indexedInitialBatch = allNFTs.slice(0, INITIAL_LOAD).map((nft) => ({
      ...nft,
      _uniqueReactId: generateUniqueId() // Add a random unique ID 
    }));
    
    setVisibleNFTs(indexedInitialBatch);
    setIsLoadingMore(false);
  }, [allNFTs]);

  const loadMoreNFTs = useCallback(() => {
    if (isLoadingMore || visibleNFTs.length >= allNFTs.length) return;

    setIsLoadingMore(true);
    
    // Get next batch and add COMPLETELY RANDOM IDs to each NFT
    const nextBatch = allNFTs.slice(
      visibleNFTs.length,
      visibleNFTs.length + BATCH_SIZE
    ).map((nft) => ({
      ...nft,
      _uniqueReactId: generateUniqueId() // Guaranteed unique every time
    }));
    
    if (nextBatch.length > 0) {
      setVisibleNFTs(prev => [...prev, ...nextBatch]);
      
      // Allow next load after a short delay
      setTimeout(() => {
        setIsLoadingMore(false);
      }, 100);
    } else {
      setIsLoadingMore(false);
    }
  }, [allNFTs, visibleNFTs.length, isLoadingMore]);

  const handleScroll = useCallback(() => {
    const scrollPosition = window.innerHeight + window.scrollY;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (documentHeight - scrollPosition < THRESHOLD) {
      loadMoreNFTs();
    }
  }, [loadMoreNFTs]);

  // Add scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    visibleNFTs,
    isLoadingMore,
    hasMore: visibleNFTs.length < allNFTs.length
  };
};
