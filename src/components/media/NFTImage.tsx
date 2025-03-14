import { useState, useEffect } from 'react';
import { processMediaUrl, IPFS_GATEWAYS, isAudioUrlUsedAsImage, getCleanIPFSUrl, processArweaveUrl, getMediaKey } from '../../utils/media';
import Image from 'next/image';
import type { SyntheticEvent } from 'react';
import type { NFT } from '../../types/user';
import { useNFTPreloader } from '../../hooks/useNFTPreloader';
import { logger } from '../../utils/logger';
import { getNftCdnUrl, preloadNftMedia } from '../../utils/cdn';

// Create a dedicated logger for NFT images
const imageLogger = logger.getModuleLogger('nftImage');

interface NFTImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  nft?: NFT;
  sizes?: string;
  quality?: number;
  loading?: 'lazy' | 'eager';
  placeholder?: 'empty';
}

const extractIPFSHash = (url: string): string | null => {
  if (!url) return null;
  
  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', '');
  }

  // Match IPFS hash patterns - support both v0 and v1 CIDs
  const ipfsRegex = /(?:ipfs\/|\/ipfs\/|ipfs:)([a-zA-Z0-9]{46,}|Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55})/i;
  const match = url.match(ipfsRegex);
  
  if (match) return match[1];
  
  // Handle direct CID
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{55}|[a-zA-Z0-9]{46,})$/.test(url)) {
    return url;
  }
  
  return null;
};

const getNextIPFSUrl = (url: string, currentIndex: number): { url: string; nextIndex: number } | null => {
  // Clean the URL first
  url = getCleanIPFSUrl(url);
  
  // If we've already tried all gateways, return null
  if (currentIndex >= IPFS_GATEWAYS.length - 1) {
    imageLogger.warn('All IPFS gateways have been tried', { url });
    return null;
  }

  // Extract IPFS hash/CID from the URL
  let cid = null;
  
  // Try to find which gateway we're currently using
  const currentGateway = IPFS_GATEWAYS.find(gateway => url.includes(gateway));
  if (currentGateway) {
    // Get the path after the gateway
    const path = url.split(currentGateway)[1];
    if (path) {
      cid = path;
    }
  } else {
    // Try to extract hash directly from URL
    cid = extractIPFSHash(url);
  }
  
  if (!cid) {
    imageLogger.warn('Could not extract IPFS CID from URL', { url });
    return null;
  }
  
  const nextIndex = (currentIndex + 1) % IPFS_GATEWAYS.length;
  return {
    url: `${IPFS_GATEWAYS[nextIndex]}${cid}`,
    nextIndex
  };
};

export const NFTImage: React.FC<NFTImageProps> = ({ 
  src, 
  alt, 
  className, 
  width = 300, 
  height = 300, 
  priority = false,
  nft,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  quality = 75,
  loading = 'lazy',
  placeholder = 'empty'
}) => {
  const fallbackSrc = '/default-nft.png';
  const [isVideo, setIsVideo] = useState(false);
  
  // Check if src is valid, if not use fallback immediately
  const initialSrc = !src || src === '' || src === 'undefined' || src === 'null' ? fallbackSrc : src;
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);
  const [error, setError] = useState(!src || src === '' || src === 'undefined' || src === 'null');
  const [retryCount, setRetryCount] = useState(0);
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [isLoadingFallback, setIsLoadingFallback] = useState(!src || src === '' || src === 'undefined' || src === 'null');

  useEffect(() => {
    // Reset states when src changes, but only if src is valid
    const isValidSrc = src && src !== '' && src !== 'undefined' && src !== 'null';
    
    if (isValidSrc) {
      // Special handling for Arweave URLs
      if (typeof src === 'string' && src.startsWith('ar://')) {
        const processedSrc = processArweaveUrl(src);
        imageLogger.info('Processing Arweave URL:', { 
          original: src, 
          processed: processedSrc 
        });
        setImgSrc(processedSrc);
      } else {
        // If we have an NFT object, use the CDN URL specifically for this NFT
        if (nft) {
          const cdnUrl = getNftCdnUrl(nft, 'image');
          imageLogger.info('Using CDN URL for NFT image:', { 
            nft: nft.name || 'Unknown', 
            cdnUrl 
          });
          setImgSrc(cdnUrl);
        } else {
          // Process the URL to handle special protocols like ipfs://
          const processedSrc = processMediaUrl(src, fallbackSrc, 'image');
          setImgSrc(processedSrc);
        }
      }
      
      setError(false);
      setRetryCount(0);
      setCurrentGatewayIndex(0);
      setIsLoadingFallback(false);
    } else {
      // Invalid source, use fallback immediately
      setImgSrc(fallbackSrc);
      setError(true);
      setIsLoadingFallback(true);
    }
    
    const isAudioUrl = (url: string): boolean => {
      if (!url) return false;
      
      // Check for common audio extensions
      const audioExtensions = /\.(mp3|wav|ogg|m4a|aac)$/i;
      
      // Check for audio MIME types
      const audioMimeTypes = /(audio\/|application\/ogg)/i;
      
      return (
        audioExtensions.test(url) || 
        audioMimeTypes.test(url) || 
        url.includes('/audio/')
      );
    };

    const detectMediaContent = (url: string) => {
      if (!url) return false;
      
      // Check metadata mime types first
      if (nft?.metadata?.mimeType) {
        if (nft.metadata.mimeType.startsWith('audio/') || 
            nft.metadata.mimeType.startsWith('video/')) {
          return true;
        }
      }

      if (nft?.metadata?.properties?.mimeType) {
        if (nft.metadata.properties.mimeType.startsWith('audio/') || 
            nft.metadata.properties.mimeType.startsWith('video/')) {
          return true;
        }
      }
      
      // Check for common video extensions
      const videoExtensions = /\.(mp4|webm|ogg|mov|m4v)$/i;
      
      // Check for video MIME types in the URL
      const videoMimeTypes = /(video\/|application\/x-mpegURL|application\/vnd\.apple\.mpegurl)/i;
      
      return (
        videoExtensions.test(url) || 
        videoMimeTypes.test(url) || 
        url.includes('/video/') ||
        isAudioUrl(url)
      );
    };

    setError(false);
    setRetryCount(0);

    // Always use the NFT's image as thumbnail, regardless of content type
    if (nft?.metadata?.image || nft?.image) {
      setIsVideo(false);
      const thumbnailUrl = nft.metadata?.image || nft.image;
      
      // Check if image URL matches any audio URL
      if (nft && isAudioUrlUsedAsImage(nft, thumbnailUrl)) {
        imageLogger.warn('NFT using audio URL as image, using fallback:', {
          contract: nft.contract,
          tokenId: nft.tokenId
        });
        setImgSrc(fallbackSrc);
        return;
      }
      
      // Use CDN for NFT thumbnails if available
      if (nft) {
        setImgSrc(getNftCdnUrl(nft, 'image'));
      } else {
        setImgSrc(processMediaUrl(thumbnailUrl, fallbackSrc, 'image'));
      }
      return;
    }

    // For NFTs with image
    if (src) {
      // Check if image URL matches any audio URL
      if (nft && isAudioUrlUsedAsImage(nft, src)) {
        setIsVideo(false);
        setImgSrc(fallbackSrc);
        imageLogger.warn('NFT using audio URL as image, using fallback:', {
          contract: nft.contract,
          tokenId: nft.tokenId
        });
        return;
      }
      
      setIsVideo(false);
      // Clean and process the URL - handle all special URL types including ar://
      if (nft) {
        // Use CDN for NFT images if we have the NFT object
        setImgSrc(getNftCdnUrl(nft, 'image'));
      } else if (src.includes('ipfs') || src.includes('nftstorage.link') || src.startsWith('ar://')) {
        const cleanedUrl = src.startsWith('ar://') ? src : getCleanIPFSUrl(src);
        setImgSrc(processMediaUrl(cleanedUrl, fallbackSrc, 'image'));
      } else {
        // Use CDN for direct URLs too
        setImgSrc(processMediaUrl(src, fallbackSrc, 'image'));
      }
    }
    // Fallback
    else {
      setIsVideo(false);
      setImgSrc(fallbackSrc);
    }
  }, [src, nft]);

  const handleError = async (error: SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    // Log the error
    imageLogger.warn('NFT Image load failed:', { 
      nftId: nft ? `${nft.contract}-${nft.tokenId}` : 'unknown',
      mediaKey: nft ? getMediaKey(nft) : 'unknown',
      originalSrc: src,
      failedSrc: error.currentTarget.src || imgSrc,
      isVideo,
      retryCount
    });
    
    // If we have an NFT, try to preload its media into the CDN cache for future requests
    if (nft) {
      preloadNftMedia(nft);
    }
    
    // Special handling for Arweave URLs
    if (src && src.includes('ar://')) {
      try {
        // Try a different approach for Arweave URLs
        const arweaveTxId = src.split('/').pop()?.split('.')[0];
        if (arweaveTxId) {
          const directArweaveUrl = `https://arweave.net/${arweaveTxId}`;
          imageLogger.info('Trying direct Arweave URL:', directArweaveUrl);
          setImgSrc(directArweaveUrl);
          setRetryCount(retryCount + 1);
          return;
        }
      } catch (err) {
        imageLogger.error('Error processing Arweave URL:', err);
      }
    }
    
    // CRITICAL: Immediately switch to fallback image and force re-render
    setTimeout(() => {
      // Use setTimeout to ensure state updates happen in new event loop
      setError(true);
      setIsLoadingFallback(true);
      setImgSrc(fallbackSrc);
      
      // Force image element to reload with fallback
      const imgElement = error.currentTarget as HTMLImageElement;
      if (imgElement) {
        imgElement.src = fallbackSrc;
      }
    }, 0);
    
    // Disabled gateway cycling for now to ensure fallback image works reliably
    /* 
    // Try next IPFS gateway (disabled)
    const nextGateway = getNextIPFSUrl(imgSrc, currentGatewayIndex);
    if (nextGateway) {
      setImgSrc(nextGateway.url);
      setCurrentGatewayIndex(nextGateway.nextIndex);
      setRetryCount(prev => prev + 1);
    }
    */
  };

  // Use regular img tag for IPFS content to bypass Next.js image optimization
  const isIPFS = imgSrc.includes('ipfs') || imgSrc.includes('nftstorage.link') || imgSrc.includes('arweave.net');
  
  // CRITICAL: Additional validation before finalizing source
  // This ensures we NEVER show a blank card, even for malformed NFT data
  const validateSrc = (source: string): boolean => {
    return Boolean(source) && 
           source !== 'undefined' && 
           source !== 'null' && 
           source !== '' &&
           source !== 'https://undefined' &&
           source !== 'https://null' &&
           !source.includes('undefined');
  };
  
  // CRITICAL: Always display fallback image when there's an error or invalid source - NO EXCEPTIONS
  // Double-validate that fallback path is correct and accessible
  const absoluteFallbackSrc = fallbackSrc.startsWith('/') ? fallbackSrc : `/${fallbackSrc}`;
  const finalSrc = (error || isLoadingFallback || !validateSrc(imgSrc)) ? absoluteFallbackSrc : imgSrc;
  
  // Check if this is an Arweave URL (either original ar:// or converted arweave.net)
  const isArweave = finalSrc.includes('arweave.net') || finalSrc.startsWith('ar://');
  
  // For Arweave URLs, use regular img tag to bypass Next.js image restrictions
  if (isArweave) {
    // Convert ar:// to https://arweave.net/ if needed
    const arweaveUrl = finalSrc.startsWith('ar://') 
      ? processArweaveUrl(finalSrc)
      : finalSrc;
      
    return (
      <img
        src={arweaveUrl}
        alt={alt}
        className={className}
        width={width || 300}
        height={height || 300}
        onError={handleError}
        // Add a data attribute to help with debugging
        data-nft-image-status={error ? 'error' : 'loaded'}
        data-nft-id={nft ? `${nft.contract}-${nft.tokenId}` : 'unknown'}
        data-original-src={src}
        // Force re-render when source changes to ensure fallback works
        key={`nft-img-${error ? 'fallback' : 'original'}-${nft?.contract || ''}-${nft?.tokenId || ''}-${isLoadingFallback ? 'fallback' : 'normal'}`}
      />
    );
  }
  
  // For other content types, use Next.js Image or regular img based on IPFS status
  if (isVideo || !isIPFS) {
    return (
      <Image
        src={finalSrc}
        alt={alt}
        className={className}
        width={width || 300}
        height={height || 300}
        quality={quality}
        sizes={sizes}
        loading={priority ? 'eager' : loading}
        placeholder={placeholder}
        onError={handleError}
        // Add a data attribute to help with debugging
        data-nft-image-status={error ? 'error' : 'loaded'}
        data-nft-id={nft ? `${nft.contract}-${nft.tokenId}` : 'unknown'}
        // Force re-render when source changes to ensure fallback works
        key={`nft-img-${error ? 'fallback' : 'original'}-${nft?.contract || ''}-${nft?.tokenId || ''}-${isLoadingFallback ? 'fallback' : 'normal'}`}
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
      // Add a data attribute to help with debugging
      data-nft-image-status={error ? 'error' : 'loaded'}
      data-nft-id={nft ? `${nft.contract}-${nft.tokenId}` : 'unknown'}
      loading={priority ? 'eager' : loading}
      sizes={sizes}
      // Use a key that forces re-render when switching to fallback
      key={`nft-img-${error ? 'fallback' : 'original'}-${nft?.contract || ''}-${nft?.tokenId || ''}-${isLoadingFallback ? 'loading' : 'loaded'}`}
      style={{ objectFit: 'cover' }}
    />
  );
};