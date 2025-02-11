'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AdPlayerProps {
  onAdComplete: () => void;
}

// List of available ad videos
const AD_VIDEOS = [
  '/ad-video.mp4',
  '/ad-video-2.mp4',
  '/ad-video-3.mp4'
];

export const AdPlayer: React.FC<AdPlayerProps> = ({ onAdComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [selectedAd] = useState(() => {
    // Randomly select an ad when component mounts
    const randomIndex = Math.floor(Math.random() * AD_VIDEOS.length);
    return AD_VIDEOS[randomIndex];
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      onAdComplete();
    };

    const handleTimeUpdate = () => {
      if (video) {
        const remaining = Math.max(0, Math.round(video.duration - video.currentTime));
        setTimeRemaining(remaining);
      }
    };

    const handleLoadedMetadata = () => {
      if (video) {
        setTimeRemaining(Math.round(video.duration));
      }
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.play().catch(console.error);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [onAdComplete]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <video
        ref={videoRef}
        src={selectedAd}
        className="w-full h-full object-contain"
        playsInline
      />
      <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-1 rounded-full font-mono text-sm">
        Ad: {timeRemaining}s
      </div>
    </div>
  );
};
