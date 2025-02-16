import { useState, useEffect, useCallback } from 'react';
import { NFT } from '../types/user';

const INITIAL_LOAD = 12;
const BATCH_SIZE = 12;
const THRESHOLD = 400; // pixels from bottom to trigger load

export const useVirtualizedNFTs = (allNFTs: NFT[]) => {
  const [visibleNFTs, setVisibleNFTs] = useState<NFT[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Initialize with first batch and reset loading state
  useEffect(() => {
    setVisibleNFTs(allNFTs.slice(0, INITIAL_LOAD));
    setIsLoadingMore(false);
  }, [allNFTs]);

  const loadMoreNFTs = useCallback(() => {
    if (isLoadingMore || visibleNFTs.length >= allNFTs.length) return;

    setIsLoadingMore(true);
    
    const nextBatch = allNFTs.slice(
      visibleNFTs.length,
      visibleNFTs.length + BATCH_SIZE
    );
    
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
