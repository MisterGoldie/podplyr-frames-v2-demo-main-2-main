import React from 'react';
import { NFT } from '../../types/user';
import { NFTCard } from './NFTCard';
import { useVirtualizedNFTs } from '../../hooks/useVirtualizedNFTs';

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

  // Log the number of NFTs for debugging
  console.log('Rendering VirtualizedNFTGrid with', visibleNFTs.length, 'visible NFTs out of', nfts.length, 'total');

  return (
    <>
      {visibleNFTs.map((nft: any) => (
        <NFTCard
          // Use the guaranteed unique random ID directly
          key={nft._uniqueReactId || `fallback_${Math.random().toString(36).substring(2, 11)}`}
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
          isNFTLiked={isNFTLiked ? (nftToCheck: NFT) => isNFTLiked(nftToCheck, false) : undefined}
        />
      ))}
      
      {/* PROMINENT LOAD MORE BUTTON - Always visible when there are more NFTs to load */}
      {hasMore && (
        <div className="col-span-full flex flex-col items-center justify-center py-4 my-6">
          <p className="font-mono text-gray-400 text-sm mb-3">
            Showing {visibleNFTs.length} of {nfts.length} NFTs
          </p>
          
          {/* SUPER PROMINENT LOAD MORE BUTTON */}
          <button 
            onClick={() => loadMoreNFTs()} 
            disabled={isLoadingMore}
            className="w-full max-w-xs py-4 px-8 bg-green-500/40 hover:bg-green-500/60 text-white font-bold rounded-lg text-lg transition-colors flex items-center justify-center gap-3"
          >
            {isLoadingMore ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <span>LOAD MORE NFTs</span>
                <span className="text-xs">({nfts.length - visibleNFTs.length} remaining)</span>
              </>
            )}
          </button>
          
          {/* Additional loading indicator */}
          {isLoadingMore && (
            <div className="mt-4 text-green-400 text-sm">Loading next batch of NFTs...</div>
          )}
        </div>
      )}

      {/* Spacer for triggering automatic loading */}
      {hasMore && (
        <div className="col-span-full h-40">
          {/* This invisible element helps trigger loading when approaching bottom */}
        </div>
      )}

      {!hasMore && visibleNFTs.length > 0 && (
        <div className="col-span-full text-center py-8">
          <p className="font-mono text-gray-400 text-sm">All {nfts.length} NFTs loaded</p>
        </div>
      )}
    </>
  );
};
