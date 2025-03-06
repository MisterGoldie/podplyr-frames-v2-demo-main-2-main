import { useState, useEffect } from 'react';
import { processMediaUrl, IPFS_GATEWAYS, isAudioUrlUsedAsImage, getCleanIPFSUrl } from '../../utils/media';
import Image from 'next/image';
import type { SyntheticEvent } from 'react';
import type { NFT } from '../../types/user';
import { useNFTPreloader } from '../../hooks/useNFTPreloader';


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
    console.warn('All IPFS gateways have been tried', { url });
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
    console.warn('Could not extract IPFS CID from URL', { url });
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
  
  // SUPER AGGRESSIVE VALIDATION: Check for ANY potentially problematic image source
  // This validation is intentionally paranoid to ensure users ALWAYS see content
  const isInvalidSource = !src || 
                         src === '' || 
                         src === 'undefined' || 
                         src === 'null' || 
                         src.includes('undefined') || 
                         src.includes('null') || 
                         (src.startsWith('ipfs://') && !src.includes('://Qm')) || 
                         src === 'https://' || 
                         src === 'http://' ||
                         src.endsWith('/null') ||
                         src.endsWith('/undefined') ||
                         src.includes('/ipfs/null') ||
                         src.includes('/ipfs/undefined') ||
                         src.length < 10; // Too short to be valid
  
  // Initialize with fallback if source is invalid
  const initialSrc = isInvalidSource ? fallbackSrc : src;
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);
  const [error, setError] = useState(isInvalidSource);
  const [retryCount, setRetryCount] = useState(0);
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [isLoadingFallback, setIsLoadingFallback] = useState(isInvalidSource);
  // Track if image has loaded successfully
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // Reset states when src changes, but only if src is valid
    const isValidSrc = src && src !== '' && src !== 'undefined' && src !== 'null';
    
    if (isValidSrc) {
      setImgSrc(src);
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
        console.warn('NFT using audio URL as image, using fallback:', {
          contract: nft.contract,
          tokenId: nft.tokenId
        });
        setImgSrc(fallbackSrc);
        return;
      }
      
      setImgSrc(processMediaUrl(thumbnailUrl));
      return;
    }

    // For NFTs with image
    if (src) {
      // Check if image URL matches any audio URL
      if (nft && isAudioUrlUsedAsImage(nft, src)) {
        setIsVideo(false);
        setImgSrc(fallbackSrc);
        console.warn('NFT using audio URL as image, using fallback:', {
          contract: nft.contract,
          tokenId: nft.tokenId
        });
        return;
      }
      
      setIsVideo(false);
      // Clean and process the URL
      if (src.includes('ipfs') || src.includes('nftstorage.link')) {
        const cleanedUrl = getCleanIPFSUrl(src);
        setImgSrc(processMediaUrl(cleanedUrl));
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

  // Handle image load success
  const handleLoad = () => {
    setHasLoaded(true);
    setError(false);
    setIsLoadingFallback(false);
  };

  const handleError = async (error: SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    // Log the error with detailed information to help debug
    console.warn('NFT Image load failed:', { 
      nftId: nft ? `${nft.contract}-${nft.tokenId}` : 'unknown',
      nftName: nft?.name || 'unknown',
      collection: nft?.collectionName || 'unknown',
      originalSrc: src,
      failedSrc: error.currentTarget.src || imgSrc,
      isVideo,
      retryCount,
      errorType: error.type,
      hasLoaded,
      cause: 'load_error'
    });
    
    // ALWAYS switch to fallback image immediately - no exceptions, no retries
    // This ensures users always see something instead of an empty container
    setIsLoadingFallback(true);
    setError(true);
    setImgSrc(fallbackSrc);
    return;

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
    
    // Generate a unique key to force re-render when switching to fallback
    // This ensures the DOM actually updates with the new image source
  };

  // Use regular img tag for IPFS content to bypass Next.js image optimization
  const isIPFS = imgSrc.includes('ipfs') || imgSrc.includes('nftstorage.link');
  
  // CRITICAL: Additional validation before finalizing source
  // This ensures we NEVER show a blank card, even for malformed NFT data
  const validateSrc = (source: string): boolean => {
    return Boolean(source) && 
           source !== 'undefined' && 
           source !== 'null' && 
           source !== '' &&
           source !== 'https://undefined' &&
           source !== 'https://null' &&
           !source.endsWith('/null') &&
           !source.endsWith('/undefined') &&
           !source.includes('/ipfs/null') &&
           !source.includes('/ipfs/undefined') &&
           source.length >= 10; // Ensure URL is long enough to be valid
  };
  
  // Always display fallback image when there's an error or invalid source - NO EXCEPTIONS
  const finalSrc = (error || isLoadingFallback || !validateSrc(imgSrc)) ? fallbackSrc : imgSrc;
  
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
      onLoad={handleLoad}
      // Add a data attribute to help with debugging
      data-nft-image-status={error ? 'error' : (hasLoaded ? 'loaded' : 'loading')}
      data-nft-id={nft ? `${nft.contract}-${nft.tokenId}` : 'unknown'}
      data-nft-name={nft?.name || 'unknown'}
      />
    );
  }

  // CRITICAL: Generate a unique key that forces re-render when switching to fallback
  // This ensures the DOM actually updates with the new image source
  const key = `nft-img-${error ? 'fallback' : (hasLoaded ? 'loaded' : 'initial')}-${nft?.contract || 'unknown'}-${nft?.tokenId || 'unknown'}-${isLoadingFallback ? 'loading-fallback' : 'normal'}-${retryCount}`;
  
  // Use timeout to detect slow-loading images
  useEffect(() => {
    if (!isLoadingFallback && !error && imgSrc !== fallbackSrc) {
      const timeoutId = setTimeout(() => {
        // If image hasn't loaded after timeout, use fallback
        if (!hasLoaded) {
          console.warn('NFT Image timeout - switching to fallback:', { 
            nftId: nft ? `${nft.contract}-${nft.tokenId}` : 'unknown',
            nftName: nft?.name || 'unknown',
            src: imgSrc,
            cause: 'loading_timeout' 
          });
          setIsLoadingFallback(true);
          setError(true);
          setImgSrc(fallbackSrc);
        }
      }, 2500); // 2.5 second timeout (reduced for better UX)
      
      return () => clearTimeout(timeoutId);
    }
  }, [imgSrc, isLoadingFallback, error, hasLoaded, nft, fallbackSrc]);
  
  return (
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      width={width || 300}
      height={height || 300}
      onError={handleError}
      onLoad={handleLoad}
      // Add a data attribute to help with debugging
      data-nft-image-status={error ? 'error' : (hasLoaded ? 'loaded' : 'loading')}
      data-nft-name={nft?.name || 'unknown'}
      data-nft-id={nft ? `${nft.contract}-${nft.tokenId}` : 'unknown'}
      loading={priority ? 'eager' : loading}
      sizes={sizes}
      // Use a key that forces re-render when switching to fallback
      key={key}
      style={{ objectFit: 'cover' }}
      data-src-status={imgSrc === fallbackSrc ? 'fallback' : 'original'}
    />
  );
};