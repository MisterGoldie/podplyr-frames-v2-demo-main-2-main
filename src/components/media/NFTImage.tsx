import { useState, useEffect } from 'react';
import { processMediaUrl } from '../../utils/media';
import Image from 'next/image';

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
      const videoExtensions = /\.(mp4|webm|ogg|mov)$/i;
      return videoExtensions.test(url) || url.includes('animation_url') || url.includes('/video/');
    };

    setError(false);
    setRetryCount(0);

    // For video NFTs, use the animation_url
    if (nft?.metadata?.animation_url && detectVideoContent(nft.metadata.animation_url)) {
      setIsVideo(true);
      setImgSrc(processMediaUrl(nft.metadata.animation_url, fallbackSrc));
    } 
    // For NFTs with image
    else if (src) {
      setIsVideo(false);
      // Use the original src if it's a dweb.link URL, otherwise process it
      setImgSrc(src.includes('.ipfs.dweb.link') ? src : processMediaUrl(src, fallbackSrc));
    }
    // Fallback
    else {
      setIsVideo(false);
      setImgSrc(fallbackSrc);
    }
  }, [src, nft]);

  const handleError = () => {
    console.error('Image failed to load:', imgSrc);
    
    // Try alternative IPFS gateway if available
    const alternativeUrl = getAlternativeIPFSUrl(imgSrc);
    if (alternativeUrl && retryCount < 3) {
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
      <video
        src={imgSrc}
        className={className}
        width={width}
        height={height}
        controls
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