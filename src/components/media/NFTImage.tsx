import { useState, useEffect } from 'react';
import { processMediaUrl } from '../../utils/media';

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
  const fallbackSrc = '/images/video-placeholder.png';
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
      setImgSrc(processMediaUrl(src) || fallbackSrc);
    }
    // For audio NFTs without image, use the waveform or audio visualization
    else if (nft?.audio || nft?.metadata?.animation_url) {
      setIsVideo(false);
      // Use a generated waveform or audio visualization here
      setImgSrc(`https://picsum.photos/seed/${nft.contract}-${nft.tokenId}/300/300`);
    }
  }, [src, nft]);

  if (isVideo) {
    return (
      <div className={className} style={{ width, height, position: 'relative' }}>
        <video
          src={imgSrc}
          className="w-full h-full object-cover"
          preload="metadata"
          playsInline
          muted
          loop
          autoPlay
        >
          <source src={imgSrc} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" className="w-12 h-12 text-white opacity-75">
            <path d="M320-200v-560l440 280-440 280Z"/>
          </svg>
        </div>
      </div>
    );
  }

  return imgSrc ? (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={() => setImgSrc(fallbackSrc)}
      loading={priority ? "eager" : "lazy"}
    />
  ) : null;
};