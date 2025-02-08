import { useState, useEffect } from 'react';
import { processMediaUrl } from '../../utils/media';
import Image from 'next/image';
import type { SyntheticEvent } from 'react';

const IPFS_GATEWAYS = ['https://ipfs.io', 'https://cloudflare-ipfs.com', 'https://gateway.pinata.cloud'];

interface NFTImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  nft?: any; // For checking animation_url
}

const getAlternativeIPFSUrl = (url: string) => {
  if (!url.includes('ipfs')) return null;

  const currentGateway = IPFS_GATEWAYS.find(gateway => url.includes(gateway));
  if (!currentGateway) return null;

  const alternativeGateway = IPFS_GATEWAYS[(IPFS_GATEWAYS.indexOf(currentGateway) + 1) % IPFS_GATEWAYS.length];
  return url.replace(currentGateway, alternativeGateway);
};

export const NFTImage: React.FC<NFTImageProps> = ({ 
  src, 
  alt, 
  className, 
  width, 
  height, 
  priority,
  nft 
}) => {
  const fallbackSrc = '/default-nft.png';
  const [isVideo, setIsVideo] = useState(false);
  const [imgSrc, setImgSrc] = useState<string>(fallbackSrc);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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
      setImgSrc(src.includes('.ipfs.dweb.link') || src.includes('nftstorage.link') ? src : processMediaUrl(src, fallbackSrc));
    }
    // Fallback
    else {
      setIsVideo(false);
      setImgSrc(fallbackSrc);
    }
  }, [src, nft]);

  const handleError = (error: SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    console.error('Media failed to load:', { 
      src: error.currentTarget.src || imgSrc,
      isVideo, 
      currentSrc: error.currentTarget.currentSrc,
      nftMetadata: nft?.metadata,
      rawAnimationUrl: nft?.metadata?.animation_url 
    });
    
    // For nftstorage.link URLs that fail, try using them directly
    if (nft?.metadata?.animation_url?.includes('nftstorage.link') && retryCount === 0) {
      setImgSrc(nft.metadata.animation_url);
      setRetryCount(prev => prev + 1);
      return;
    }
    
    // Try alternative IPFS gateway if available
    const alternativeUrl = getAlternativeIPFSUrl(imgSrc);
    if (alternativeUrl && retryCount < IPFS_GATEWAYS.length) {
      console.log('Trying alternative IPFS gateway:', alternativeUrl);
      setImgSrc(alternativeUrl);
      setRetryCount(prev => prev + 1);
      return;
    }

    // If we've exhausted all retries or it's not an IPFS URL, use fallback
    setError(true);
    setImgSrc(fallbackSrc);
  };

  if (isVideo) {
    return (
      <Image
        src={imgSrc}
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
    <Image
      src={error ? fallbackSrc : imgSrc}
      alt={alt}
      className={className}
      width={width || 300}
      height={height || 300}
      priority={priority}
      onError={handleError}
    />
  );
};