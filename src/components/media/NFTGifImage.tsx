import React, { useState, useRef, useEffect } from 'react';
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
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Use Intersection Observer to only load when visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Only load animated version when visible and interacted with
  const shouldLoadAnimated = isVisible && isAnimating;
  
  return (
    <div 
      ref={elementRef}
      className={`relative ${className}`}
      onMouseEnter={() => setIsAnimating(true)}
      onMouseLeave={() => setIsAnimating(false)}
    >
      {/* Static preview image */}
      <img
        src={nft.image}
        alt={nft.name || 'NFT'}
        className={`w-full h-full object-cover ${shouldLoadAnimated ? 'opacity-0' : 'opacity-100'}`}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        style={{ 
          maxWidth: '100%', 
          maxHeight: '100%',
          position: shouldLoadAnimated ? 'absolute' : 'relative',
          transition: 'opacity 0.3s ease-in-out'
        }}
      />
      
      {/* Animated version - only loaded when needed */}
      {shouldLoadAnimated && (
        <img
          src={nft.image}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={width}
          height={height}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            willChange: 'transform'
          }}
        />
      )}
    </div>
  );
}; 