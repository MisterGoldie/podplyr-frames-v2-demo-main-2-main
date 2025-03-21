import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { NFT } from '../../types/user';
import { NFTImage } from '../media/NFTImage';
import { MuxPlayer } from '../media/MuxPlayer';
import { processMediaUrl, getMediaKey } from '../../utils/media';
import { useNFTLikeState } from '../../hooks/useNFTLikeState';
import { useNFTPlayCount } from '../../hooks/useNFTPlayCount';
import { FarcasterContext } from '../../app/providers';
import { DirectVideoPlayer } from '../media/DirectVideoPlayer';
import { UltraDirectPlayer } from '../media/UltraDirectPlayer';
import { NFTGifImage } from '../media/NFTGifImage';
import { useSessionImageCache } from '../../hooks/useSessionImageCache';
import { useNFTNotification } from '../../context/NFTNotificationContext';
import { logger } from '../../utils/logger';
// Removed the import for 'react-intersection-observer' due to the error

interface NFTCardProps {
  nft: NFT;
  onPlay: (nft: NFT) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  onLikeToggle?: (nft: NFT) => Promise<void>;
  publicCollections?: string[];
  onAddToCollection?: (nft: NFT, collectionId: string) => void;
  onRemoveFromCollection?: (nft: NFT, collectionId: string) => void;
  viewMode?: 'list' | 'grid';
  badge?: string;
  playCountBadge?: string;
  showTitleOverlay?: boolean;
  useCenteredPlay?: boolean;
  isLibraryView?: boolean;
  userFid?: number;
  isNFTLiked?: (nft: NFT) => boolean;
  animationDelay?: number;
  smallCard?: boolean; // If true, adjusts styling for smaller cards in the recently played section
}

// Add keyframes for the animation
const animationKeyframes = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// Create a dedicated logger for NFT cards
const nftCardLogger = logger.getModuleLogger('nftCard');

export const NFTCard: React.FC<NFTCardProps> = ({ 
  nft, 
  onPlay, 
  isPlaying, 
  currentlyPlaying, 
  handlePlayPause,
  onLikeToggle,
  publicCollections,
  onAddToCollection,
  onRemoveFromCollection,
  viewMode = 'grid',
  badge,
  playCountBadge,
  showTitleOverlay = false,
  smallCard = false,
  useCenteredPlay = false,
  isLibraryView = false,
  userFid = 0,
  isNFTLiked,
  animationDelay = 0.2
}) => {
  // Get the NFT notification context at the component level
  // NEW: Add validation for NFT data to prevent crashes from broken NFTs
  const isValidNFT = useMemo(() => {
    // Basic validation - check if NFT exists and has minimum required properties
    if (!nft) return false;
    
    // Check for critical display properties
    const hasDisplayInfo = Boolean(
      // Either a name OR some kind of identifier
      nft.name || 
      (nft.contract && nft.tokenId)
    );
    
    // Validate image URL before using it
    const validateMediaUrl = (url: string | undefined): boolean => {
      if (!url) return false;
      return (
        url !== 'undefined' && 
        url !== 'null' && 
        url !== '' &&
        !url.includes('undefined') &&
        !url.includes('null://')
      );
    };
    
    // Check for media - we need at least one valid media source
    const hasMedia = Boolean(
      validateMediaUrl(nft.image) || 
      validateMediaUrl(nft.metadata?.image) ||
      validateMediaUrl(nft.audio) ||
      validateMediaUrl(nft.metadata?.animation_url)
    );
    
    // Log detailed info for invalid NFTs to help diagnose issues
    if (!hasDisplayInfo || !hasMedia) {
      console.warn('Invalid NFT data detected:', {
        nft,
        hasDisplayInfo,
        hasMedia,
        name: nft?.name,
        contract: nft?.contract,
        tokenId: nft?.tokenId,
        image: nft?.image || nft?.metadata?.image,
        audio: nft?.audio || nft?.metadata?.animation_url
      });
    }
    
    return hasDisplayInfo && hasMedia;
  }, [nft]);
  
  // We'll define a function to render the invalid NFT UI
  // but we won't return early - this ensures all hooks run in consistent order
  const renderInvalidNFT = () => (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-square shadow-lg">
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
        {/* Always show the placeholder image */}
        <img 
          src="/default-nft.png" 
          alt="NFT Placeholder" 
          className="absolute inset-0 w-full h-full object-cover opacity-50"
          loading="lazy"
        />
        <div className="z-10 bg-black/50 p-2 rounded-lg flex flex-col items-center">
          <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="mt-2 text-xs text-white font-medium">NFT data unavailable</span>
        </div>
      </div>
    </div>
  );
  
  // Memoize the nft object to prevent infinite updates
  const memoizedNft = useMemo(() => [nft], [nft.contract, nft.tokenId]);
  const { getPreloadedImage, preloadImage } = useSessionImageCache(memoizedNft);
  
  // Validate image URL to prevent loading errors
  const validateImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    if (typeof url !== 'string') return false;
    return (
      url !== 'undefined' && 
      url !== 'null' && 
      url !== '' &&
      !url.includes('undefined') &&
      !url.includes('null://')
    );
  };
  // Get mediaKey for content-based tracking
  const mediaKey = getMediaKey(nft);
  
  // Get like state based on context - if we're in library view, NFT is always liked
  const { isLiked: likeStateFromHook, likesCount: globalLikesCount } = useNFTLikeState(nft, userFid || 0);
  
  // ENHANCED: Check multiple sources for like status to ensure consistency
  // 1. First check if the NFT has isLiked property directly set
  // 2. Then check if isNFTLiked function is provided and use that
  // 3. Finally fall back to the hook's state
  const isLiked = nft.isLiked === true ? true : 
                 (typeof isNFTLiked === 'function' ? isNFTLiked(nft) : likeStateFromHook);
  
  // Log to debug like status
  useEffect(() => {
    nftCardLogger.debug(`NFT "${nft.name}" (mediaKey: ${mediaKey}) liked status:`, {
      fromDirectProperty: nft.isLiked === true,
      fromPropFunction: typeof isNFTLiked === 'function' ? isNFTLiked(nft) : 'N/A',
      fromHook: likeStateFromHook,
      finalValue: isLiked
    });
  }, [nft, mediaKey, isNFTLiked, likeStateFromHook, isLiked]);
  
  // Add data attributes for DOM-based synchronization
  useEffect(() => {
    if (cardRef.current && mediaKey) {
      // Set data attributes for DOM-based synchronization
      cardRef.current.setAttribute('data-media-key', mediaKey);
      cardRef.current.setAttribute('data-liked', isLiked ? 'true' : 'false');
      cardRef.current.setAttribute('data-is-liked', isLiked ? 'true' : 'false');
      
      // Also set data-nft-id for contract-tokenId based targeting
      if (nft.contract && nft.tokenId) {
        cardRef.current.setAttribute('data-nft-id', `${nft.contract}-${nft.tokenId}`);
      }
    }
  }, [mediaKey, isLiked, nft.contract, nft.tokenId]);
  
  // Listen for custom like state change events
  useEffect(() => {
    // Skip if we don't have a valid mediaKey
    if (!mediaKey) return;
    
    const handleLikeStateChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      
      // Only process events for this NFT
      if (detail.mediaKey === mediaKey || 
          (detail.contract === nft.contract && detail.tokenId === nft.tokenId)) {
        nftCardLogger.debug('Received like state change event:', {
          mediaKey,
          isLiked: detail.isLiked,
          nftName: nft.name
        });
        
        // Update the card's DOM attributes
        if (cardRef.current) {
          cardRef.current.setAttribute('data-liked', detail.isLiked ? 'true' : 'false');
          cardRef.current.setAttribute('data-is-liked', detail.isLiked ? 'true' : 'false');
        }
      }
    };
    
    // Add event listener
    document.addEventListener('nftLikeStateChange', handleLikeStateChange);
    
    // Clean up
    return () => {
      document.removeEventListener('nftLikeStateChange', handleLikeStateChange);
    };
  }, [mediaKey, nft.contract, nft.tokenId, nft.name]);
  
  // In library view, ensure at least 1 like
  const likesCount = isLibraryView ? Math.max(1, globalLikesCount) : globalLikesCount;
  
  // Get real-time play count
  const { playCount } = useNFTPlayCount(nft);
  
  // Only show badge if explicitly passed as 'Top Played'
  const shouldShowBadge = badge === 'Top Played';
  
  // Show play count pill if provided
  const shouldShowPlayCount = Boolean(playCountBadge);
  
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentTrack = currentlyPlaying === getMediaKey(nft);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Set up intersection observer to detect when card is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          // Preload image when card becomes visible
          preloadImage(nft);
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [nft, preloadImage]);

  // Only load animated content when card is visible
  const shouldLoadAnimated = isVisible;

  // Get cached image if available
  const cachedImage = getPreloadedImage(nft);
  const rawImageUrl = nft.image || nft.metadata?.image || '';
  const imageUrl = cachedImage ? cachedImage.src : 
    validateImageUrl(rawImageUrl) ? processMediaUrl(rawImageUrl) : '/default-nft.png';

  const startOverlayTimer = (e: React.MouseEvent | React.TouchEvent) => {
    // Clear any existing timeout
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    // Show the overlay
    setShowOverlay(true);
    
    // For recently played NFTs, keep the overlay visible longer
    // or don't auto-hide it at all if it's the current track
    if (isCurrentTrack) {
      // Don't auto-hide if this is the current track
      return;
    }
    
    // Set new timeout to hide overlay after 5 seconds
    overlayTimeoutRef.current = setTimeout(() => {
      // Only hide if it's not the current track
      if (!isCurrentTrack) {
        setShowOverlay(false);
      }
    }, 5000);
  };

  // Also, modify the useEffect to ensure the overlay stays visible for the current track
  useEffect(() => {
    // If this becomes the current track, show the overlay
    if (isCurrentTrack) {
      setShowOverlay(true);
    }
    
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [isCurrentTrack]);

  const handlePlay = async (e: React.MouseEvent | React.TouchEvent) => {
    // Stop event propagation to prevent parent elements from capturing the event
    e.stopPropagation();
    e.preventDefault();
    
    nftCardLogger.debug('Play button clicked for NFT:', {
      contract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name,
      audio: nft.audio,
      animation_url: nft.metadata?.animation_url
    });

    if (isCurrentTrack) {
      nftCardLogger.debug('Current track, toggling play/pause');
      handlePlayPause();
    } else {
      nftCardLogger.debug('New track, calling onPlay');
      try {
        await onPlay(nft);
        if (e) startOverlayTimer(e);
      } catch (error) {
        nftCardLogger.error('Error playing NFT:', error);
      }
    }
  };

  // Get notification context - moved higher up in the component to ensure it's available
  const nftNotification = useNFTNotification();
  
  // Add animation styles - apply to ALL cards with a consistent animation
  const animationStyle = {
    opacity: 0,
    transform: 'translateY(20px)',
    animation: `fadeInUp 0.5s ease-out ${animationDelay}s forwards`
  };

  // Add a state to track local like status for immediate feedback
  const [isLikedLocally, setIsLikedLocally] = useState<boolean | null>(null);

  // Initialize local state from the prop when component mounts
  useEffect(() => {
    if (isLikedLocally === null && isNFTLiked) {
      setIsLikedLocally(isNFTLiked(nft));
    }
  }, [isNFTLiked, nft, isLikedLocally]);

  // Handle like toggle with local state update first
  const handleLikeToggle = () => {
    // Update local state immediately for UI response
    setIsLikedLocally(prev => !prev);
    
    // Then call the actual handler
    onLikeToggle();
  };

  // Use the local state OR the checked state for rendering
  const heartFilled = isLikedLocally !== null ? isLikedLocally : isNFTLiked(nft);

  // All hooks are guaranteed to be called before any return statements now

  // For list mode
  if (viewMode === 'list') {
    // If NFT is invalid, render fallback UI
    if (!isValidNFT) {
      return renderInvalidNFT();
    }

    // Otherwise render normal list view
    return (
      <>
        <style>{animationKeyframes}</style>
        <div 
          ref={cardRef}
          className="group flex items-center gap-4 bg-gradient-to-br from-gray-800/30 to-gray-800/10 p-3 rounded-lg active:bg-gray-800/60 hover:bg-gray-800/40 transition-colors touch-manipulation shadow-xl shadow-purple-900/30 border border-purple-400/10 cursor-pointer" 
          style={animationStyle} 
          data-nft-id={`${nft.contract}-${nft.tokenId}`}
        >
          <div className="relative w-16 h-16 flex-shrink-0">
            {/* Always include invisible fallback that can be shown if media fails */}
            <img 
              src="/default-nft.png" 
              alt="Fallback NFT" 
              className="absolute inset-0 w-full h-full object-cover opacity-0 rounded-md"
              loading="eager"
              onLoad={(e) => {
                // Keep fallback hidden unless needed
                if (e.currentTarget) e.currentTarget.style.opacity = '0';
              }}
            />
            
            {shouldLoadAnimated && nft.metadata?.animation_url?.toLowerCase().endsWith('.mp4') || 
             nft.metadata?.animation_url?.toLowerCase().endsWith('.webm') ? (
              <DirectVideoPlayer
                nft={nft}
                onLoadComplete={() => {}}
                onError={(err) => {
                  console.warn('Video player error for NFT in list view:', nft.name, err);
                  // Show fallback on video error
                  const fallbackEl = cardRef.current?.querySelector('img[src="/default-nft.png"]');
                  if (fallbackEl) (fallbackEl as HTMLImageElement).style.opacity = '1';
                }}
              />
            ) : shouldLoadAnimated && (nft.name === 'ACYL RADIO - Hidden Tales' || 
                nft.name === 'ACYL RADIO - WILL01' || 
                nft.name === 'ACYL RADIO - Chili Sounds 🌶️') ? (
              <NFTGifImage
                nft={nft}
                className="w-full h-full"
                width={64}
                height={64}
              />
            ) : (
              <NFTImage
                nft={nft}
                src={imageUrl}
                alt={nft.name || 'NFT'}
                className="w-full h-full object-cover rounded-md"
                width={64}
                height={64}
                priority={nft.featuredSortOrder !== undefined} // Prioritize loading of featured NFTs
              />
            )}
            {shouldShowBadge && (
              <div className="absolute top-1 right-1 bg-purple-400 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                {badge}
              </div>
            )}
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="text-green-400 font-mono text-sm truncate">{nft.name}</h3>
            <p className="text-gray-400 text-xs truncate">{nft.description}</p>
          </div>
          <button 
            onClick={(e) => handlePlay(e)}
            className="text-green-400 hover:text-green-300 transition-colors"
          >
            {isCurrentTrack && isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="M320-200v-560l440 280-440 280Z"/>
              </svg>
            )}
          </button>
        </div>
      </>
    );
  }

  // For grid mode (default)
  // If NFT is invalid, render the fallback UI
  if (!isValidNFT) {
    return renderInvalidNFT();
  }

  // Otherwise render normal grid view  
  return (
    <>
      <style>{animationKeyframes}</style>
      <div 
        ref={cardRef}
        className="group relative bg-gradient-to-br from-gray-800/30 to-gray-800/10 rounded-lg overflow-hidden hover:bg-gray-800/40 active:bg-gray-800/60 transition-all duration-500 ease-in-out touch-manipulation shadow-xl shadow-purple-900/30 border border-purple-400/10"
        onMouseEnter={(e) => {
          if (useCenteredPlay && e) startOverlayTimer(e);
        }}
        onTouchStart={(e) => {
          if (useCenteredPlay && e) startOverlayTimer(e);
        }}
        style={animationStyle}
        data-nft-id={`${nft.contract}-${nft.tokenId}`}
      >
        <div className="aspect-square relative">
          {/* Double protection - if media fails to load, show default fallback image */}
          <img 
            src="/default-nft.png" 
            alt="Fallback NFT" 
            className="absolute inset-0 w-full h-full object-cover opacity-0"
            loading="eager"
            onLoad={(e) => {
              // Keep the fallback hidden unless needed
              if (e.currentTarget) e.currentTarget.style.opacity = '0';
            }}
          />
          
          {shouldLoadAnimated && nft.metadata?.animation_url?.toLowerCase().endsWith('.mp4') || 
           nft.metadata?.animation_url?.toLowerCase().endsWith('.webm') ? (
            <DirectVideoPlayer
              nft={nft}
              onLoadComplete={() => {}}
              onError={(err) => {
                nftCardLogger.warn('Video player error for NFT:', nft.name, err);
                // Show fallback on video error
                const fallbackEl = cardRef.current?.querySelector('img[src="/default-nft.png"]');
                if (fallbackEl) (fallbackEl as HTMLImageElement).style.opacity = '1';
              }}
            />
          ) : shouldLoadAnimated && (nft.name === 'ACYL RADIO - Hidden Tales' || 
              nft.name === 'ACYL RADIO - WILL01' || 
              nft.name === 'ACYL RADIO - Chili Sounds 🌶️') ? (
            <NFTGifImage
              nft={nft}
              className="w-full h-full"
              width={300}
              height={300}
            />
          ) : (
            <NFTImage
              nft={nft}
              src={imageUrl}
              alt={nft.name || 'NFT'}
              className="w-full h-full object-cover"
              width={300}
              height={300}
              priority={nft.featuredSortOrder !== undefined} // Prioritize loading of featured NFTs
            />
          )}
          {shouldShowPlayCount && (
            <div className="absolute top-2 left-2 bg-purple-400 text-white text-xs px-2 py-1 rounded-full font-medium">
              {playCountBadge}
            </div>
          )}
          <div className={useCenteredPlay ? 
            `absolute inset-0 bg-black/20 transition-all duration-1000 ease-in-out ${showOverlay ? 'opacity-100' : 'opacity-0'}` : 
            'absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200'
          } />
          {/* Add like button with improved event handling */}
          {/* Only show like button if we have a valid userFid or we're in library view */}
          {(userFid > 0 || isLibraryView) && (
            <div 
              className={`absolute z-30 ${smallCard ? 'top-1 right-1' : 'top-2 right-2'}`}
              onClick={(e) => {
                nftCardLogger.debug('Like button parent div clicked');
                e.stopPropagation();
              }}
              style={{ touchAction: 'manipulation' }}
            >
            {onLikeToggle ? (
              <HeartIconWithForcedState isLiked={heartFilled} />
            ) : (
              <button 
                onClick={(e) => {
                  nftCardLogger.debug('Like button clicked but NO onLikeToggle function available');
                  e.stopPropagation();
                }}
                className="w-8 h-8 flex items-center justify-center opacity-50 cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="gray">
                  <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                </svg>
              </button>
            )}
          </div>
          )}
          {useCenteredPlay ? (
            <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-1000 ease-in-out delay-75 z-20 ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
              <button 
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  nftCardLogger.debug('Centered play button clicked for:', nft.name);
                  await handlePlay(e);
                }}
                className="w-16 h-16 rounded-full bg-purple-500 text-black flex items-center justify-center mb-3 hover:scale-105 transform transition-all duration-300 ease-out active:scale-95 touch-manipulation"
                aria-label={isCurrentTrack && isPlaying ? "Pause" : "Play"}
              >
                {isCurrentTrack && isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                    <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>
                )}
              </button>
              {showTitleOverlay && (
                <h3 className="text-white font-mono text-sm text-center px-4 truncate w-[90%] bg-black/50 py-2 rounded">{nft.name}</h3>
              )}
            </div>
          ) : (
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();
                nftCardLogger.debug('Corner play button clicked for:', nft.name);
                await handlePlay(e);
              }}
              className={`absolute bottom-2 right-2 w-10 h-10 rounded-full bg-purple-500 text-black flex items-center justify-center ${isCurrentTrack ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200 hover:scale-105 transform touch-manipulation`}
              aria-label={isCurrentTrack && isPlaying ? "Pause" : "Play"}
            >
              {isCurrentTrack && isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                  <path d="M320-200v-560l440 280-440 280Z"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

const HeartIconWithForcedState = ({ isLiked }: { isLiked: boolean }) => {
  // Store the initial state in a ref that won't change
  const initialLikedState = useRef(isLiked);
  
  // Use the ref value for rendering
  return (
    <div 
      className="absolute bottom-2 right-2 z-10" 
      onClick={(e) => {
        e.stopPropagation();
        
        // Mark this card as explicitly unliked by the user if it was liked
        if (isNFTLiked && isNFTLiked(nft) && cardRef.current) {
          cardRef.current.setAttribute('data-user-unliked', 'true');
        } else if (cardRef.current) {
          // This is being liked - mark as most recently liked
          cardRef.current.querySelector('.heart-icon')?.setAttribute('data-recently-liked', 'true');
          
          // Dispatch an event to notify the app of the recently liked NFT
          const mediaKey = getMediaKey(nft);
          const likeEvent = new CustomEvent('nftLikeStateChange', {
            detail: {
              mediaKey,
              contract: nft.contract,
              tokenId: nft.tokenId,
              isLiked: true,
              timestamp: Date.now(),
              isRecent: true
            }
          });
          document.dispatchEvent(likeEvent);
        }
        
        // Call the normal like toggle handler
        onLikeToggle();
      }}
    >
      <HeartIcon 
        className={`w-6 h-6 heart-icon ${isNFTLiked(nft) ? 'text-red-500 fill-red-500' : 'text-white'}`}
        data-liked={isNFTLiked(nft).toString()}
      />
    </div>
  );
};

useEffect(() => {
  // Mark this card with its NFT ID to help our global override
  if (cardRef.current && nft.contract && nft.tokenId) {
    cardRef.current.setAttribute('data-nft-id', `${nft.contract}-${nft.tokenId}`);
    
    // If this card is liked, force-mark it
    if (isNFTLiked && isNFTLiked(nft)) {
      cardRef.current.setAttribute('data-force-liked', 'true');
    }
  }
}, [nft, isNFTLiked]);