import { useState, useEffect } from 'react';
import { processMediaUrl } from '../../utils/media';
import Image from 'next/image';

interface NFTImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  nft?: any; // For checking animation_url
}

export const NFTImage: React.FC<NFTImageProps> = ({ 
  src, 
  alt, 
  className, 
  width, 
  height, 
  priority,
  nft 
}) => {
  const fallbackSrc = '/default-nft.png'; // Simple fallback in public directory
  const [isVideo, setIsVideo] = useState(false);
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    const detectVideoContent = (url: string) => {
      if (!url) return false;
      const videoExtensions = /\.(mp4|webm|ogg|mov)$/i;
      return videoExtensions.test(url) || url.includes('animation_url') || url.includes('/video/');
    };

    // For video NFTs, use the animation_url
    if (nft?.metadata?.animation_url && detectVideoContent(nft.metadata.animation_url)) {
      setIsVideo(true);
      setImgSrc(processMediaUrl(nft.metadata.animation_url));
    } 
    // For audio NFTs with image, use the image
    else if (src) {
      setIsVideo(false);
      setImgSrc(processMediaUrl(src));
    }
    // For audio NFTs without image, use a default music icon
    else {
      setIsVideo(false);
      setImgSrc(fallbackSrc);
    }
  }, [src, nft]);

  if (!imgSrc) return null;

  if (isVideo) {
    return (
      <video
        src={imgSrc}
        className={className}
        width={width}
        height={height}
        controls
        poster={fallbackSrc}
      />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      className={className}
      width={width || 300}
      height={height || 300}
      priority={priority}
      onError={() => setImgSrc(fallbackSrc)}
    />
  );
};