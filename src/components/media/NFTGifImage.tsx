import React, { useState, useRef, useEffect } from 'react';
import { NFT } from '../../types/user';
import { processMediaUrl } from '../../utils/media';

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const animatedImgRef = useRef<HTMLImageElement>(null);
  
  // Process the image URL to ensure it's properly formatted
  const imageUrl = nft.image ? processMediaUrl(nft.image, '/default-nft.png', 'image') : '/default-nft.png';
  
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

  // Check if another NFT is currently playing audio
  const isAnotherNFTPlaying = document.querySelector('.now-playing') !== null;
  
  // Only load animated version when visible and either:
  // 1. User is hovering over it, OR
  // 2. No other NFT is playing (to reduce performance impact)
  const shouldLoadAnimated = isVisible && (isAnimating || !isAnotherNFTPlaying);
  
  // Pause animated GIFs when another NFT is playing to reduce CPU usage
  useEffect(() => {
    if (isAnotherNFTPlaying && animatedImgRef.current) {
      // Technique to pause GIF animation: remove and reattach to DOM
      const parent = animatedImgRef.current.parentNode;
      if (parent) {
        const clone = animatedImgRef.current.cloneNode(false) as HTMLImageElement;
        clone.style.animationPlayState = 'paused';
        parent.replaceChild(clone, animatedImgRef.current);
        animatedImgRef.current = clone;
      }
    }
  }, [isAnotherNFTPlaying]);

  // Handle image load success
  const handleImageLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  // Handle image load error
  const handleImageError = () => {
    setHasError(true);
  };

  return (
    <div 
      ref={elementRef}
      className={`relative ${className}`}
      onMouseEnter={() => setIsAnimating(true)}
      onMouseLeave={() => setIsAnimating(false)}
    >
      {/* Fallback for errors */}
      {hasError && (
        <img
          src="/default-nft.png"
          alt="Fallback"
          className="w-full h-full object-cover"
          width={width}
          height={height}
        />
      )}
      
      {/* Static preview image - optimized with proper loading strategy */}
      {!hasError && (
        <img
          src={imageUrl}
          alt={nft.name || 'NFT'}
          className={`w-full h-full object-cover ${shouldLoadAnimated && isLoaded ? 'opacity-0' : 'opacity-100'}`}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            position: 'absolute',
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      )}
      
      {/* Animated version - only loaded when needed, with performance optimizations */}
      {shouldLoadAnimated && !hasError && (
        <img
          ref={animatedImgRef}
          src={imageUrl}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={width}
          height={height}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            willChange: 'transform',
            // Use hardware acceleration to improve performance
            transform: 'translateZ(0)',
            // Reduce animation impact when another NFT is playing
            animationPlayState: isAnotherNFTPlaying ? 'paused' : 'running'
          }}
        />
      )}
    </div>
  );
}; 