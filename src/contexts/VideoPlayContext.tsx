'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { NFT } from '../types/user';
import { trackNFTPlay } from '../lib/firebase';
import { FarcasterContext } from '../app/providers';

interface VideoPlayContextType {
  playCount: number;
  incrementPlayCount: (nft: NFT) => void;
  resetPlayCount: (currentNFT?: NFT) => void;
  trackNFTProgress: (nft: NFT, currentTime: number, duration: number) => void;
  hasReachedPlayThreshold: (nft: NFT) => boolean;
}

// Create a type for tracking NFT playback thresholds
type NFTPlaybackState = {
  mediaKey: string;
  duration: number;
  thresholdReached: boolean;
};

// Create the context with default undefined value
const VideoPlayContext = createContext<VideoPlayContextType | undefined>(undefined);

export const VideoPlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playCount, setPlayCount] = useState(0);
  // Track which NFTs have reached 25% threshold
  const [playedNFTs, setPlayedNFTs] = useState<NFTPlaybackState[]>([]);
  // Track which NFTs have already been reported to Firebase in the current play attempt
  const [reportedNFTs, setReportedNFTs] = useState<Set<string>>(new Set());
  
  // Get user's FID from context
  const { fid } = useContext(FarcasterContext);
  
  // Get the mediaKey from NFT or generate one
  const getNFTMediaKey = (nft: NFT): string => {
    // Use existing mediaKey if available
    if (nft.mediaKey) return nft.mediaKey;
    
    // Otherwise use contract-tokenId as a fallback identifier
    return `${nft.contract}-${nft.tokenId}`;
  };

  // Track an NFT's playback progress
  const trackNFTProgress = useCallback((nft: NFT, currentTime: number, duration: number) => {
    if (!nft || !duration || !fid) return;
    
    const mediaKey = getNFTMediaKey(nft);
    const threshold = duration * 0.25; // 25% threshold
    
    // Note: We still use reportedNFTs, but this gets cleared when an NFT starts playing again
    // This prevents multiple reports for the same playback session
    if (reportedNFTs.has(mediaKey)) return;
    
    // Check if we've already tracked this NFT in the current session
    const existingIndex = playedNFTs.findIndex(item => item.mediaKey === mediaKey);
    
    if (existingIndex >= 0) {
      // NFT is already being tracked
      const nftState = playedNFTs[existingIndex];
      
      // If threshold not yet reached and current time exceeds it
      if (!nftState.thresholdReached && currentTime >= threshold) {
        // Update the NFT state to mark threshold as reached
        const updatedNFTs = [...playedNFTs];
        updatedNFTs[existingIndex] = {
          ...nftState,
          thresholdReached: true
        };
        setPlayedNFTs(updatedNFTs);
        console.log(`🎵 25% threshold reached for NFT: ${nft.name || 'Unnamed'}`);
        
        // Report to Firebase only once per NFT
        if (!reportedNFTs.has(mediaKey)) {
          console.log(`💾 Recording play in Firebase for NFT: ${nft.name || 'Unnamed'}`);
          // Track play in Firebase
          trackNFTPlay(nft, fid)
            .then(() => {
              // Add to reported set after successfully logging to Firebase
              setReportedNFTs(prev => new Set([...prev, mediaKey]));
            })
            .catch(error => {
              console.error('Error tracking NFT play in Firebase:', error);
            });
        }
      }
    } else {
      // First time tracking this NFT
      const thresholdReached = currentTime >= threshold;
      setPlayedNFTs(prev => [
        ...prev,
        {
          mediaKey,
          duration,
          thresholdReached
        }
      ]);
      
      if (thresholdReached) {
        console.log(`🎵 25% threshold already reached for NFT: ${nft.name || 'Unnamed'}`);
        
        // Report to Firebase only once per NFT
        if (!reportedNFTs.has(mediaKey)) {
          console.log(`💾 Recording play in Firebase for NFT: ${nft.name || 'Unnamed'}`);
          // Track play in Firebase
          trackNFTPlay(nft, fid)
            .then(() => {
              // Add to reported set after successfully logging to Firebase
              setReportedNFTs(prev => new Set([...prev, mediaKey]));
            })
            .catch(error => {
              console.error('Error tracking NFT play in Firebase:', error);
            });
        }
      }
    }
  }, [fid, playedNFTs, reportedNFTs]);
  
  // Check if an NFT has reached the play threshold
  const hasReachedPlayThreshold = useCallback((nft: NFT): boolean => {
    if (!nft) return false;
    
    const mediaKey = getNFTMediaKey(nft);
    const nftState = playedNFTs.find(item => item.mediaKey === mediaKey);
    
    return nftState?.thresholdReached || false;
  }, [playedNFTs]);

  // Increment play count only if threshold has been reached
  const incrementPlayCount = useCallback((nft: NFT) => {
    if (!nft) return;
    
    // Only count the play if we've reached the threshold
    if (hasReachedPlayThreshold(nft)) {
      setPlayCount(prev => prev + 1);
    } else {
      console.log(`⏳ Not counting play yet for ${nft.name || 'Unnamed NFT'} - 25% threshold not reached`);
    }
  }, [hasReachedPlayThreshold]);

  const resetPlayCount = useCallback((currentNFT?: NFT) => {
    setPlayCount(0);
    
    // When resetting, we should also clear the playedNFTs for the current NFT
    // to allow it to be tracked again, even within the same session
    if (currentNFT) {
      const mediaKey = getNFTMediaKey(currentNFT);
      
      // Remove this NFT from playedNFTs if it exists
      setPlayedNFTs(prev => prev.filter(item => item.mediaKey !== mediaKey));
      
      // Also remove from reportedNFTs
      setReportedNFTs(prev => {
        const newSet = new Set(prev);
        newSet.delete(mediaKey);
        return newSet;
      });
    } else {
      // If no specific NFT is provided, just reset everything
      setPlayedNFTs([]);
    }
    
    // Note: We don't clear all reportedNFTs to avoid re-reporting other currently playing NFTs
  }, []);

  return (
    <VideoPlayContext.Provider value={{ 
      playCount, 
      incrementPlayCount, 
      resetPlayCount,
      trackNFTProgress,
      hasReachedPlayThreshold
    }}>
      {children}
    </VideoPlayContext.Provider>
  );
};

export const useVideoPlay = () => {
  const context = useContext(VideoPlayContext);
  if (context === undefined) {
    throw new Error('useVideoPlay must be used within a VideoPlayProvider');
  }
  return context;
};
