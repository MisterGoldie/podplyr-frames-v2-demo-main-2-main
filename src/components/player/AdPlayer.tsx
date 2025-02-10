'use client';

import React, { useRef, useEffect } from 'react';

interface AdPlayerProps {
  onAdComplete: () => void;
}

export const AdPlayer: React.FC<AdPlayerProps> = ({ onAdComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

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
        src="/ad-video.mp4"
        className="w-full h-full object-contain"
        playsInline
      />
      <div className="absolute top-4 right-4 text-white text-sm">
        Ad
      </div>
    </div>
  );
};
