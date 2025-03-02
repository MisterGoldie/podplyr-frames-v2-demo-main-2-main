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
  const { visibleNFTs, isLoadingMore, hasMore } = useVirtualizedNFTs(nfts);

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
      
      {isLoadingMore && (
        <div className="col-span-full flex justify-center py-8">
          <div className="relative">
            <div className="w-8 h-8 border-2 border-gray-800/30 rounded-full"></div>
            <div className="absolute top-0 w-8 h-8 border-2 border-t-green-400 border-r-green-400 rounded-full animate-spin"></div>
          </div>
        </div>
      )}

      {!isLoadingMore && !hasMore && visibleNFTs.length > 0 && (
        <div className="col-span-full text-center py-8">
          <p className="font-mono text-gray-400 text-sm">All NFTs loaded</p>
        </div>
      )}

      {!isLoadingMore && hasMore && visibleNFTs.length > 0 && (
        <div className="col-span-full text-center py-4">
          <p className="font-mono text-gray-400 text-sm">
            Showing {visibleNFTs.length} of {nfts.length} NFTs - Scroll to load more
          </p>
        </div>
      )}
    </>
  );
};
