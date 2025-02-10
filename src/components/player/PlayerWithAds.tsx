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

  useEffect(() => {
    if (props.nft && props.isPlaying && !adComplete) {
      if (playCount >= 3) {
        // Show ad after every 3 videos
        setShowAd(true);
        props.onPlayPause(); // Pause the main content
      }
    }
  }, [props.nft, props.isPlaying, playCount, adComplete]);

  // Increment play count when a new video starts playing
  useEffect(() => {
    if (props.nft && props.isPlaying && !showAd) {
      incrementPlayCount();
    }
  }, [props.nft?.tokenId, props.isPlaying]);

  const handleAdComplete = () => {
    setShowAd(false);
    setAdComplete(true);
    resetPlayCount();
    props.onPlayPause(); // Resume the main content
  };

  // Reset ad complete state when NFT changes
  useEffect(() => {
    setAdComplete(false);
  }, [props.nft]);

  return (
    <>
      {showAd ? (
        <AdPlayer onAdComplete={handleAdComplete} />
      ) : (
        <Player {...props} />
      )}
    </>
  );
};
