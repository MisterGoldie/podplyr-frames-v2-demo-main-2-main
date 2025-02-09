import { useState, useEffect } from 'react';
import { processMediaUrl } from '../../utils/media';
import Image from 'next/image';
import type { SyntheticEvent } from 'react';

const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com',
  'https://ipfs.io',
  'https://gateway.pinata.cloud',
  'https://nftstorage.link',
  'https://ipfs.fleek.co',
  'https://cf-ipfs.com'
];

interface NFTImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  nft?: any; // For checking animation_url
}

const extractIPFSHash = (url: string): string | null => {
  if (!url) return null;
  
  // Match IPFS hash patterns
  const ipfsHashRegex = /(?:ipfs\/|ipfs:|\/ipfs\/)([a-zA-Z0-9]{46})/;
  const match = url.match(ipfsHashRegex);
  
  return match ? match[1] : null;
};

const getNextIPFSUrl = (url: string, currentIndex: number): { url: string; nextIndex: number } | null => {
  const hash = extractIPFSHash(url);
  if (!hash) return null;
  
  const nextIndex = (currentIndex + 1) % IPFS_GATEWAYS.length;
  return {
    url: `${IPFS_GATEWAYS[nextIndex]}/ipfs/${hash}`,
    nextIndex
  };
};

export const NFTImage: React.FC<NFTImageProps> = ({ 
  src, 
  alt, 
  className, 
  width = 300, 
  height = 300, 
  priority,
  nft 
}) => {
  const fallbackSrc = '/default-nft.png';
  const [isVideo, setIsVideo] = useState(false);
  const [imgSrc, setImgSrc] = useState<string>(fallbackSrc);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [isLoadingFallback, setIsLoadingFallback] = useState(false);

  useEffect(() => {
    const detectVideoContent = (url: string) => {
      if (!url) return false;
      
      // Check for common video extensions
      const videoExtensions = /\.(mp4|webm|ogg|mov|m4v)$/i;
      
      // Check for video MIME types in the URL
      const videoMimeTypes = /(video\/|application\/x-mpegURL|application\/vnd\.apple\.mpegurl)/i;
      
      return (
        videoExtensions.test(url) || 
        videoMimeTypes.test(url) || 
        url.includes('/video/') ||
        (nft?.metadata?.mimeType && nft.metadata.mimeType.startsWith('video/'))
      );
    };

    setError(false);
    setRetryCount(0);

    // Always use the NFT's image as thumbnail, regardless of content type
    if (nft?.metadata?.image || nft?.image) {
      setIsVideo(false);
      const thumbnailUrl = nft.metadata?.image || nft.image;
      setImgSrc(processMediaUrl(thumbnailUrl, fallbackSrc));
      return;
    }

    // For NFTs with image
    if (src) {
      setIsVideo(false);
      // If it's an IPFS URL, use direct URL without Next.js image optimization
      if (src.includes('ipfs') || src.includes('nftstorage.link')) {
        setImgSrc(processMediaUrl(src, fallbackSrc));
      } else {
        setImgSrc(src);
      }
    }
    // Fallback
    else {
      setIsVideo(false);
      setImgSrc(fallbackSrc);
    }
  }, [src, nft]);

  const handleError = async (error: SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    // Prevent infinite retry loops
    if (retryCount >= IPFS_GATEWAYS.length) {
      if (!isLoadingFallback) {
        setIsLoadingFallback(true);
        setError(true);
        setImgSrc(fallbackSrc);
      }
      return;
    }

    // Only log detailed error on first attempt
    if (retryCount === 0) {
      console.warn('NFT Image load failed, attempting fallback gateways:', { 
        originalSrc: src,
        failedSrc: error.currentTarget.src || imgSrc,
        attempt: retryCount + 1,
        isVideo,
        nftId: nft?.id || 'unknown'
      });
    }

    // Try next IPFS gateway
    const nextGateway = getNextIPFSUrl(imgSrc, currentGatewayIndex);
    if (nextGateway) {
      setImgSrc(nextGateway.url);
      setCurrentGatewayIndex(nextGateway.nextIndex);
      setRetryCount(prev => prev + 1);
      return;
    }

    // If all gateways fail, use fallback
    console.warn(`All IPFS gateways failed for NFT image, using fallback:`, {
      nftId: nft?.id || 'unknown',
      originalSrc: src
    });
    setError(true);
    setImgSrc(fallbackSrc);
  };

  // Use regular img tag for IPFS content to bypass Next.js image optimization
  const isIPFS = imgSrc.includes('ipfs') || imgSrc.includes('nftstorage.link');
  const finalSrc = error ? fallbackSrc : imgSrc;
  
  if (isVideo || !isIPFS) {
    return (
      <Image
        src={finalSrc}
        alt={alt}
        className={className}
        width={width || 300}
        height={height || 300}
        priority={priority}
        onError={handleError}
      />
    );
  }

  return (
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      width={width || 300}
      height={height || 300}
      onError={handleError}
      loading={priority ? 'eager' : 'lazy'}
    />
  );
};