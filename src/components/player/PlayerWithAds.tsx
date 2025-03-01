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
  
  // Add refs to track the current NFT and play state
  const currentNftRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);

  // Check if we need to show an ad when attempting to play a video
  useEffect(() => {
    if (!props.nft) return;
    
    const nftId = `${props.nft.contract}-${props.nft.tokenId}`;
    
    // Only count as a new play if:
    // 1. The NFT has changed OR
    // 2. This is the first play of this NFT (currentNftRef is null)
    const isNewNft = nftId !== currentNftRef.current;
    const isFirstPlay = currentNftRef.current === null;
    
    // Update the current NFT ref
    if (isNewNft) {
      currentNftRef.current = nftId;
    }
    
    // Only process play count logic when:
    // 1. We have an NFT
    // 2. The player is playing
    // 3. We're not showing an ad
    // 4. Either it's a new NFT or it's the first play after mounting
    if (props.nft && props.isPlaying && !adComplete && !showAd) {
      // Only increment play count if this is a new NFT or first play
      if ((isNewNft || isFirstPlay) && !wasPlayingRef.current) {
        console.log('Counting as a new play - NFT changed or first play');
        
        // Update play counts
        incrementPlayCount();
        if (hasShownFirstAd) {
          setPlaysAfterAd(prev => prev + 1);
        }
        
        // Check if we need to show an ad
        if (!hasShownFirstAd && playCount === 2) { // Will be 3 after increment
          console.log('Showing first ad');
          setShowAd(true);
          props.onPlayPause();
          setHasShownFirstAd(true);
        } else if (hasShownFirstAd && playsAfterAd === 8) { // Will be 9 after increment
          console.log('Showing subsequent ad');
          setShowAd(true);
          props.onPlayPause();
        }
      }
    }
    
    // Update the wasPlaying ref for the next render
    wasPlayingRef.current = props.isPlaying;
    
    // Debug logs
    if (props.isPlaying && !showAd) {
      console.log('Current play count:', playCount);
      console.log('Plays after last ad:', playsAfterAd);
    }
  }, [props.nft, props.isPlaying]);

  // Force pause content if ad is showing and handle nav visibility
  useEffect(() => {
    const nav = document.querySelector('nav');
    if (showAd) {
      if (nav) nav.style.display = 'none';
      if (props.isPlaying) props.onPlayPause();
    } else {
      if (nav) nav.style.display = 'flex';
    }
  }, [showAd, props.isPlaying]);

  const handleAdComplete = () => {
    setShowAd(false);
    setAdComplete(true);
    resetPlayCount();
    setPlaysAfterAd(0); // Reset the counter for plays after ad
    const nav = document.querySelector('nav');
    if (nav) nav.style.display = 'flex';
    props.onPlayPause(); // Resume the main content
  };

  // Reset states when NFT changes
  useEffect(() => {
    if (props.nft) {
      const nftId = `${props.nft.contract}-${props.nft.tokenId}`;
      
      // Only reset ad state if the NFT has actually changed
      if (nftId !== currentNftRef.current) {
        setAdComplete(false);
        // Don't reset hasShownFirstAd as that should persist for the session
        currentNftRef.current = nftId;
      }
    }
  }, [props.nft]); // Use the entire nft object to ensure we detect all changes

  // Don't render anything until ad is complete if we're showing an ad
  if (showAd) {
    return <AdPlayer onAdComplete={handleAdComplete} />;
  }

  // Only render the Player when no ad is showing
  return <Player {...props} />;
}