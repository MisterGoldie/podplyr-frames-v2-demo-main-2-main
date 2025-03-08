import React, { useEffect, useState } from 'react';
import { NFT } from '../../types/user';
import { NFTCard } from './NFTCard';
import { useVirtualizedNFTs } from '../../hooks/useVirtualizedNFTs';
import ErrorBoundary from '../ErrorBoundary';

interface VirtualizedNFTGridProps {
  nfts: NFT[];
  currentlyPlaying: string | null;
  isPlaying: boolean;
  handlePlayPause: () => void;
  onPlayNFT: (nft: NFT) => void;
  publicCollections: string[];
  addToPublicCollection?: (nft: NFT, collectionId: string) => void;
  removeFromPublicCollection?: (nft: NFT, collectionId: string) => void;
  onLikeToggle?: (nft: NFT) => Promise<void>;
  isNFTLiked?: (nft: NFT, ignoreCurrentPage?: boolean) => boolean;
  userFid?: number;
}

// Add keyframes style for the animation
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

export const VirtualizedNFTGrid: React.FC<VirtualizedNFTGridProps> = ({
  nfts,
  currentlyPlaying,
  isPlaying,
  handlePlayPause,
  onPlayNFT,
  publicCollections,
  addToPublicCollection,
  removeFromPublicCollection,
  onLikeToggle,
  isNFTLiked,
  userFid,
}) => {
  const { visibleNFTs, isLoadingMore, hasMore, loadMoreNFTs } = useVirtualizedNFTs(nfts);
  const [animationKey, setAnimationKey] = useState(0);

  // Log the number of NFTs for debugging
  console.log('Rendering VirtualizedNFTGrid with', visibleNFTs.length, 'visible NFTs out of', nfts.length, 'total');
  
  // Modified check function - no logging on each check to avoid console spam
  const checkDirectlyLiked = (nftToCheck: NFT): boolean => {
    if (!isNFTLiked) return false;
    // Always use true for ignoreCurrentPage to get real like status regardless of page
    return isNFTLiked(nftToCheck, true);
  };
  
  // Reduced logging - just once when component mounts
  useEffect(() => {
    // One-time debugging log to verify props
    console.log('VirtualizedNFTGrid rendered with:',
      'onLikeToggle=', !!onLikeToggle,
      'isNFTLiked=', !!isNFTLiked,
      'userFid=', userFid);
  }, []);

  // When new NFTs are loaded, update the animation key
  useEffect(() => {
    if (visibleNFTs.length > 0) {
      setAnimationKey(prev => prev + 1);
    }
  }, [visibleNFTs.length]);

  return (
    <>
      {/* Add the keyframes style */}
      <style>{animationKeyframes}</style>
      
      {visibleNFTs.map((nft: any, index: number) => {
        // Calculate a staggered delay based on index
        // This creates a wave-like appearance as cards animate in
        const staggerDelay = 0.05 * (index % 8) + 0.2; // Base delay of 0.2s plus stagger
        
        return (
          <ErrorBoundary key={`boundary-${nft._uniqueReactId || Math.random()}`}>
            <NFTCard
              key={`${animationKey}-${nft._uniqueReactId || `fallback_${Math.random().toString(36).substring(2, 11)}`}`}
              nft={nft}
              onPlay={async (nft) => {
                await onPlayNFT(nft);
              }}
              isPlaying={isPlaying}
              currentlyPlaying={currentlyPlaying}
              handlePlayPause={handlePlayPause}
              publicCollections={publicCollections}
              onAddToCollection={addToPublicCollection}
              onRemoveFromCollection={removeFromPublicCollection}
              showTitleOverlay={true}
              useCenteredPlay={true}
              onLikeToggle={onLikeToggle}
              userFid={userFid}
              isNFTLiked={checkDirectlyLiked}
              animationDelay={staggerDelay} // Pass the staggered delay
            />
          </ErrorBoundary>
        );
      })}
      
      {/* Remove the entire load more button section */}
      
      {/* Remove the spacer div */}
      
      {/* Keep only a simple completion message if needed */}
      {!hasMore && visibleNFTs.length > 0 && (
        <div className="col-span-full text-center py-8">
          <p className="font-mono text-gray-400 text-sm">All NFTs loaded</p>
        </div>
      )}
    </>
  );
};