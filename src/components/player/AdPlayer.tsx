'use client';

import React, { useRef, useEffect, useState } from 'react';

interface AdPlayerProps {
  onAdComplete: () => void;
  nftDuration?: number; // Duration in seconds
}

// Ad configuration with URLs
const REGULAR_ADS = [
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
  },
];

const LONG_CONTENT_AD = {
  video: '/ad-video-4.mp4',
  url: 'https://acyl.world/TV',
  title: 'ACYL TV',
  domain: 'acyl.world'
};

export const AdPlayer: React.FC<AdPlayerProps> = ({ onAdComplete, nftDuration }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [selectedAd] = useState(() => {
    // If NFT is over 30 minutes, use the long content ad
    if (nftDuration && nftDuration > 1800) {
      return LONG_CONTENT_AD;
    }
    // Otherwise randomly select from regular ads
    const randomIndex = Math.floor(Math.random() * REGULAR_ADS.length);
    return REGULAR_ADS[randomIndex];
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
        src={selectedAd.video}
        className="w-full h-full object-contain"
        playsInline
      />
      <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-1 rounded-full font-mono text-sm">
        Ad: {timeRemaining}s
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
