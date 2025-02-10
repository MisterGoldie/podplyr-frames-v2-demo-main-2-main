'use client';

import React, { useState, useEffect } from 'react';
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
  const [showAd, setShowAd] = useState(false);
  const [adComplete, setAdComplete] = useState(false);
  const [hasShownFirstAd, setHasShownFirstAd] = useState(false);
  const [playsAfterAd, setPlaysAfterAd] = useState(0);

  // Check if we need to show an ad when attempting to play a video
  useEffect(() => {
    if (props.nft && props.isPlaying && !adComplete) {
      console.log('Current play count:', playCount); // Debug log
      console.log('Plays after last ad:', playsAfterAd); // Debug log

      if (!hasShownFirstAd && playCount === 3) {
        // First ad after 3 plays
        console.log('Showing first ad');
        setShowAd(true);
        props.onPlayPause();
        setHasShownFirstAd(true);
      } else if (hasShownFirstAd && playsAfterAd === 9) {
        // Subsequent ads after 9 more plays
        console.log('Showing subsequent ad');
        setShowAd(true);
        props.onPlayPause();
      } else if (!showAd) {
        // Only increment if we're not showing an ad
        incrementPlayCount();
        if (hasShownFirstAd) {
          setPlaysAfterAd(prev => prev + 1);
        }
      }
    }
  }, [props.nft?.tokenId, props.isPlaying]);

  // Force pause content if ad is showing
  useEffect(() => {
    if (showAd && props.isPlaying) {
      props.onPlayPause();
    }
  }, [showAd, props.isPlaying]);

  const handleAdComplete = () => {
    setShowAd(false);
    setAdComplete(true);
    resetPlayCount();
    setPlaysAfterAd(0); // Reset the counter for plays after ad
    props.onPlayPause(); // Resume the main content
  };

  // Reset states when NFT changes
  useEffect(() => {
    if (props.nft) {
      setAdComplete(false);
      // Don't reset hasShownFirstAd as that should persist for the session
    }
  }, [props.nft?.tokenId]); // Use tokenId to ensure we only reset on actual NFT changes

  // Don't render anything until ad is complete if we're showing an ad
  if (showAd) {
    return <AdPlayer onAdComplete={handleAdComplete} />;
  }

  // Only render the Player when no ad is showing
  return <Player {...props} />;
};
