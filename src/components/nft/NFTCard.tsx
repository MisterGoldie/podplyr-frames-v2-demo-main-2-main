import { useState, useEffect, useRef, useContext } from 'react';
import { NFT } from '../../types/user';
import { NFTImage } from '../media/NFTImage';
import { processMediaUrl } from '../../utils/media';
import { useNFTLikeState } from '../../hooks/useNFTLikeState';
import { useNFTPlayCount } from '../../hooks/useNFTPlayCount';
import { FarcasterContext } from '../../app/providers';

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
  showTitleOverlay?: boolean;
  useCenteredPlay?: boolean;
  isLibraryView?: boolean;
  userFid?: number;
}

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
  showTitleOverlay = false,
  useCenteredPlay = false,
  isLibraryView = false,
  userFid = 0
}) => {
  // Get like state based on context - if we're in library view, NFT is always liked
  const { isLiked: likeState, likesCount } = useNFTLikeState(nft, userFid || 0);
  const isLiked = isLibraryView ? true : likeState; // In library view, always show as liked
  
  // Get real-time play count
  const { playCount } = useNFTPlayCount(nft);
  
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentTrack = currentlyPlaying === `${nft.contract}-${nft.tokenId}`;

  const startOverlayTimer = (e: React.MouseEvent | React.TouchEvent) => {
    // Clear any existing timeout
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    // Show the overlay
    setShowOverlay(true);
    // Set new timeout to hide overlay after 5 seconds
    overlayTimeoutRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 5000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  const handlePlay = async (e: React.MouseEvent | React.TouchEvent) => {
    console.log('Play button clicked for NFT:', {
      contract: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name,
      audio: nft.audio,
      animation_url: nft.metadata?.animation_url
    });

    if (isCurrentTrack) {
      console.log('Current track, toggling play/pause');
      handlePlayPause();
    } else {
      console.log('New track, calling onPlay');
      await onPlay(nft);
      if (e) startOverlayTimer(e);
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center gap-4 bg-gray-800/20 p-3 rounded-lg active:bg-gray-800/60 hover:bg-gray-800/40 transition-colors touch-manipulation">
        <div className="relative w-16 h-16 flex-shrink-0">
          <NFTImage
            nft={nft}
            src={processMediaUrl(nft.image || nft.metadata?.image || '')}
            alt={nft.name || 'NFT'}
            className="w-full h-full object-cover rounded-md"
            width={64}
            height={64}
          />
          {badge && (
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
    );
  }

  return (
    <div 
      className="group relative bg-gray-800/20 rounded-lg overflow-hidden hover:bg-gray-800/40 active:bg-gray-800/60 transition-all duration-500 ease-in-out touch-manipulation"
      onMouseEnter={(e) => {
        if (useCenteredPlay && e) startOverlayTimer(e);
      }}
      onTouchStart={(e) => {
        if (useCenteredPlay && e) startOverlayTimer(e);
      }}
    >
      <div className="aspect-square relative">
        <NFTImage
          nft={nft}
          src={processMediaUrl(nft.image || nft.metadata?.image || '')}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={300}
          height={300}
        />
        {/* Show play count for Top Played NFTs */}
        {badge?.includes('plays') && playCount > 0 && (
          <div className="absolute top-2 left-2 bg-purple-400 text-white text-xs px-2 py-1 rounded-full font-medium">
            {playCount} plays
          </div>
        )}
        <div className={useCenteredPlay ? 
          `absolute inset-0 bg-black/20 transition-all duration-1000 ease-in-out ${showOverlay ? 'opacity-100' : 'opacity-0'}` : 
          'absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200'
        } />
        {onLikeToggle && (
          <button 
            onClick={async (e) => {
              e.stopPropagation();
              await onLikeToggle(nft);
              if (e) startOverlayTimer(e);
            }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-300 hover:scale-110 z-10"
          >
            {isLiked ? (
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-red-500">
                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-white hover:text-red-500">
                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
              </svg>
            )}
          </button>
        )}
        {useCenteredPlay ? (
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-1000 ease-in-out delay-75 z-20 ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                await handlePlay(e);
                if (e) startOverlayTimer(e);
              }}
              className="w-16 h-16 rounded-full bg-purple-500 text-black flex items-center justify-center mb-3 hover:scale-105 transform transition-all duration-300 ease-out active:scale-95"
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
              await handlePlay(e);
              if (e) startOverlayTimer(e);
            }}
            className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-purple-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-105 transform"
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
  );
};