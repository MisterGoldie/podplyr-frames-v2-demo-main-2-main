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
  // Get global play count from VideoPlayContext
  const { playCount, incrementPlayCount, resetPlayCount } = useVideoPlay();
  
  // Log the imported playCount to verify it's being passed correctly
  useEffect(() => {
    console.log(`🔄 PlayerWithAds received playCount: ${playCount} from context`);
  }, [playCount]);
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
  
  // Effect 1: ONLY handle 25% threshold tracking for play counts
  // This has NOTHING to do with ad display, just accurate play tracking
  useEffect(() => {
    if (!props.nft) return;
    
    // Don't update play counts if an ad is showing
    if (showAd) return;
    
    // NEW NFT detection happens in the ad display effect
    // We just need to make sure we only track each play once
    const nftId = `${props.nft.contract}-${props.nft.tokenId}`;
    
    // Only reset play tracking when we encounter a new NFT
    if (nftId !== currentNftRef.current && props.isPlaying) {
      // Only reset tracking, don't set the currentNftRef (handled in ad display effect)
      setPlayTracked(false);
      console.log('🔔 Resetting play tracking for new NFT:', props.nft.name);
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
  
  // Log playCount on mount and when it changes
  useEffect(() => {
    console.log(`📊 Current values - playCount: ${playCount}, playsAfterAd: ${playsAfterAd}, hasShownFirstAd: ${hasShownFirstAd}`);
  }, [playCount, playsAfterAd, hasShownFirstAd]);

  // THIS IS THE KEY EFFECT: This runs WHENEVER we select a NEW NFT to play
  // It must check if we need to show an ad BEFORE the NFT starts playing
  useEffect(() => {
    if (!props.nft) return;
    
    // Don't interfere if an ad is already showing
    if (showAd) return;
    
    // Create a unique ID for the current NFT
    const nftId = `${props.nft.contract}-${props.nft.tokenId}`;
    
    // Only check for ads when a NEW NFT is selected (not during continued playback)
    const isNewNft = nftId !== currentNftRef.current;
    
    // Only run ad checks when we are SELECTING a new NFT to play
    if (isNewNft) {
      // Log the current state for debugging when NFT selection changes
      console.log(`🎬 AD CHECK ON NFT SELECTION - NEW NFT: ${props.nft.name}, playCount: ${playCount}, playsAfterAd: ${playsAfterAd}`);
      
      // CRITICAL: Check whether to show ad BEFORE the NFT starts playing
      if (!hasShownFirstAd && playCount >= 2) {
        console.log(`💬 ⚠️ SHOWING PRE-PLAY AD: First ad after ${playCount} plays`);
        setShowAd(true);
        setHasShownFirstAd(true);
      } else if (hasShownFirstAd && playsAfterAd >= 2) { // Show ad after every 3 plays
        console.log(`💬 ⚠️ SHOWING PRE-PLAY AD: Subsequent ad after ${playsAfterAd} plays after last ad`);
        setShowAd(true);
        setPlaysAfterAd(0); // Reset counter after showing ad
      } else {
        console.log(`❌ NO AD NEEDED: ${!hasShownFirstAd ? 'First ad at 3 plays' : 'Next ad at 3 plays'}, currently at ${!hasShownFirstAd ? playCount : playsAfterAd}`);
      }
      
      // Update current NFT reference
      currentNftRef.current = nftId;
    }
  }, [props.nft, playCount, playsAfterAd, hasShownFirstAd, showAd]);
  
  // We don't need a separate effect for play button clicks
  // The play tracking logic is kept separate from ad decision logic
  // This ensures ads only show BEFORE an NFT plays, not during playback

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
    // Log that ad completed
    console.log(`🎬 AD COMPLETE - Will now play: ${props.nft?.name || 'Unknown NFT'}`);
    
    // Hide the ad
    setShowAd(false);
    setAdComplete(true);
    
    // Reset play count as needed, but ONLY reset the tracking state for
    // the specific NFT we're about to play, not the global counter
    // This is crucial to maintain the correct ad frequency
    if (props.nft) {
      // IMPORTANT: Only reset the tracking state for this NFT, not the global counter
      resetPlayCount(props.nft);
      console.log(`🔄 Reset play tracking for NFT: ${props.nft.name || 'Unnamed NFT'}`);
    }
    
    // Reset play tracking state so we can count this play
    setPlayTracked(false);
    
    // Restore UI elements
    const nav = document.querySelector('nav');
    const headers = document.querySelectorAll('header');
    
    if (nav) nav.style.display = 'flex';
    headers.forEach(header => {
      header.style.display = 'flex';
    });
    
    // Short delay before resuming playback 
    setTimeout(() => {
      props.onPlayPause(); // Resume the main content after ad
    }, 100);
  };

  // Don't render anything until ad is complete if we're showing an ad
  if (showAd) {
    return <AdPlayer onAdComplete={handleAdComplete} />;
  }

  // Only render the Player when no ad is showing
  return <Player {...props} />;
}