import React, { useState } from 'react';
import { NFT } from '../../types/user';

interface NFTGifImageProps {
  nft: NFT;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export const NFTGifImage: React.FC<NFTGifImageProps> = ({
  nft,
  className,
  width = 300,
  height = 300,
  priority = false,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Use a static preview image initially
  const staticImageUrl = nft.image;
  
  // Only load the animated version when needed
  const handleMouseEnter = () => {
    setIsAnimating(true);
  };
  
  const handleMouseLeave = () => {
    setIsAnimating(false);
  };
  
  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img
        src={staticImageUrl}
        alt={nft.name || 'NFT'}
        className={`w-full h-full object-cover ${isAnimating ? 'opacity-0' : 'opacity-100'}`}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        style={{ 
          maxWidth: '100%', 
          maxHeight: '100%',
          position: isAnimating ? 'absolute' : 'relative',
          transition: 'opacity 0.3s ease-in-out'
        }}
      />
      {isAnimating && (
        <img
          src={nft.image}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={width}
          height={height}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            willChange: 'transform', 
            transform: 'translateZ(0)'
          }}
        />
      )}
    </div>
  );
}; 