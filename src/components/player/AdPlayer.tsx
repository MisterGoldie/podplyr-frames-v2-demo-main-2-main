'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AdPlayerProps {
  onAdComplete: () => void;
}

// List of available ad videos
const AD_VIDEOS = [
  '/ad-video.mp4',
  '/ad-video-2.mp4'
];

export const AdPlayer: React.FC<AdPlayerProps> = ({ onAdComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
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

    video.addEventListener('ended', handleEnded);
    video.play().catch(console.error);

    return () => {
      video.removeEventListener('ended', handleEnded);
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
      <div className="absolute top-4 right-4 text-white text-sm">
        Ad
      </div>
    </div>
  );
};
