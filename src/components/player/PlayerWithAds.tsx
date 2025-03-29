'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Player } from './Player';
import { AdPlayer } from './AdPlayer';
import { useVideoPlay } from '../../contexts/VideoPlayContext';
import type { NFT } from '../../types/user';

interface PlayerWithAdsProps {
  nft?: NFT | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  onLikeToggle?: (nft: NFT) => void;
  isLiked?: boolean;
  onPictureInPicture?: () => void;
}

export const PlayerWithAds: React.FC<PlayerWithAdsProps> = (props) => {
  const { playCount, incrementPlayCount, resetPlayCount } = useVideoPlay();
  const [navElement, setNavElement] = useState<HTMLElement | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [adComplete, setAdComplete] = useState(false);
  const [hasShownFirstAd, setHasShownFirstAd] = useState(false);
  const [playsAfterAd, setPlaysAfterAd] = useState(0);
  
  // Add ref to track the current NFT
  const currentNftRef = useRef<string | null>(null);

  // Tracking state for the 25% threshold and ad display logic
  const [playTracked, setPlayTracked] = useState(false);
  
  // Split into two separate effects: one for NFT changes and play tracking, and one for ad display
  
  // Effect 1: Handle NFT changes and 25% threshold tracking for play counts
  useEffect(() => {
    if (!props.nft) return;
    
    // Create a unique ID for the current NFT
    const nftId = `${props.nft.contract}-${props.nft.tokenId}`;
    
    // Check if this is a new NFT (different from the previous one)
    const isNewNft = nftId !== currentNftRef.current;
    
    // Reset tracking state when NFT changes
    if (isNewNft) {
      setPlayTracked(false);
      // Update the current NFT ref
      currentNftRef.current = nftId;
      console.log('New NFT detected:', nftId, 'Previous:', currentNftRef.current);
    }
    
    // Check if the NFT has reached the 25% threshold but hasn't been counted yet
    if (props.isPlaying && !showAd && !playTracked && props.nft) {
      // Check if the NFT has reached the 25% threshold
      if (props.progress >= (props.duration * 0.25)) {
        console.log(`🎵 25% threshold reached (${Math.round(props.progress)}s of ${Math.round(props.duration)}s)`);
        
        // Mark as tracked to prevent duplicate incrementing
        setPlayTracked(true);
        
        // Increment play count with the NFT parameter
        incrementPlayCount(props.nft);
        
        // Update plays after ad if we've already shown the first ad
        if (hasShownFirstAd) {
          setPlaysAfterAd(prev => prev + 1);
        }
      }
    }
  }, [props.nft, props.isPlaying, props.progress, props.duration, incrementPlayCount, playTracked, showAd, hasShownFirstAd]);
  
  // Effect 2: Handle ad display logic (check immediately when playing starts)
  useEffect(() => {
    // Only run this when playing state changes
    if (!props.nft || showAd) return;
    
    // Check if we need to show an ad when the user presses play
    if (props.isPlaying) {
      // Check if we need to show an ad based on play count
      if (!hasShownFirstAd && playCount >= 2) {
        console.log('Showing first ad after 3 plays');
        setShowAd(true);
        setHasShownFirstAd(true);
      } else if (hasShownFirstAd && playsAfterAd >= 8) {
        console.log('Showing subsequent ad after 9 more plays');
        setShowAd(true);
        setPlaysAfterAd(0); // Reset counter after showing ad
      }
    }
  }, [props.isPlaying, props.nft, playCount, playsAfterAd, hasShownFirstAd, showAd]);

  // Force pause content if ad is showing and handle nav and header visibility
  useEffect(() => {
    // Get all elements we need to hide during ad display
    const nav = document.querySelector('nav');
    const headers = document.querySelectorAll('header'); // This gets all headers in any view
    
    if (showAd) {
      // Hide navigation
      if (nav) nav.style.display = 'none';
      
      // Hide all headers
      headers.forEach(header => {
        header.style.display = 'none';
      });
      
      // Pause the main content if it's playing
      if (props.isPlaying) props.onPlayPause();
    } else {
      // Show navigation when ad is not showing
      if (nav) nav.style.display = 'flex';
      
      // Show all headers
      headers.forEach(header => {
        header.style.display = 'flex';
      });
    }
  }, [showAd, props.isPlaying, props.onPlayPause]);

  const handleAdComplete = () => {
    setShowAd(false);
    setAdComplete(true);
    
    // Reset play count and clear this specific NFT from reported set
    // This is key to allowing tracking after ads
    if (props.nft) {
      resetPlayCount(props.nft);
      console.log(`🔄 Reset play tracking for NFT: ${props.nft.name || 'Unnamed NFT'}`);
    } else {
      resetPlayCount();
    }
    
    setPlaysAfterAd(0); // Reset the counter for plays after ad
    // Reset play tracking state so the play after the ad can be counted
    setPlayTracked(false);
    
    // Restore nav and headers
    const nav = document.querySelector('nav');
    const headers = document.querySelectorAll('header');
    
    if (nav) nav.style.display = 'flex';
    headers.forEach(header => {
      header.style.display = 'flex';
    });
    
    // Add a small delay before resuming playback to ensure state updates are processed
    setTimeout(() => {
      props.onPlayPause(); // Resume the main content
    }, 100); // Slightly longer delay to ensure all state updates are processed
  };

  // Don't render anything until ad is complete if we're showing an ad
  if (showAd) {
    return <AdPlayer onAdComplete={handleAdComplete} />;
  }

  // Only render the Player when no ad is showing
  return <Player {...props} />;
}