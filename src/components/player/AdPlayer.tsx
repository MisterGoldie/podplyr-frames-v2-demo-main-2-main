'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AdPlayerProps {
  onAdComplete: () => void;
}

// Ad configuration with URLs
const AD_CONFIG = [
  {
    video: '/ad-video.mp4',
    url: 'https://acyl.world/TV',
    title: 'ACYL TV',
    domain: 'acyl.world'
  },
  {
    video: '/ad-video-2.mp4',
    url: 'https://acyl.world/TV',
    title: 'ACYL TV',
    domain: 'acyl.world'
  },
  {
    video: '/ad-video-3.mp4',
    url: 'https://theleftfieldtv.vhx.tv/',
    title: 'The Left Field',
    domain: 'theleftfieldtv.vhx.tv'
  }
];

export const AdPlayer: React.FC<AdPlayerProps> = ({ onAdComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [canSkip, setCanSkip] = useState<boolean>(false);
  const [selectedAd] = useState(() => {
    // Randomly select an ad when component mounts
    const randomIndex = Math.floor(Math.random() * AD_CONFIG.length);
    return AD_CONFIG[randomIndex];
  });

  // Track elapsed time and enable skip after 5 seconds
  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedTime(elapsed);
      if (elapsed >= 5 && !canSkip) {
        setCanSkip(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [canSkip]);

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
        src={selectedAd.video}
        className="w-full h-full object-contain"
        playsInline
      />
      <div className="absolute top-4 right-4 flex items-center gap-3">
        {canSkip && (
          <button
            onClick={onAdComplete}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1 rounded-full font-medium text-sm transition-colors"
          >
            Skip Ad
          </button>
        )}
        <div className="bg-black/80 text-white px-3 py-1 rounded-full font-mono text-sm">
          {canSkip ? 'Skip available' : `Wait ${Math.max(0, 5 - Math.floor(elapsedTime))}s to skip`}
        </div>
      </div>
      {/* Ad link container */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-purple-900/90 rounded-lg overflow-hidden border border-purple-500/30">
        <div className="flex items-center space-x-3 p-3">
          <div className="flex-1">
            <p className="text-white text-sm font-medium">{selectedAd.title}</p>
            <p className="text-gray-400 text-xs">{selectedAd.domain}</p>
          </div>
          <a
            href={selectedAd.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            Learn more
          </a>
        </div>
      </div>
    </div>
  );
};