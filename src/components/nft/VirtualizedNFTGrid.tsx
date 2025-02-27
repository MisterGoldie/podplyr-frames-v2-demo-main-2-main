import React from 'react';
import { NFT } from '../../types/user';
import { NFTCard } from './NFTCard';
import { getMediaKey } from '../../utils/media';
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
}) => {
  const { visibleNFTs, isLoadingMore, hasMore } = useVirtualizedNFTs(nfts);

  const generateUniqueNFTKey = (nft: NFT) => {
    return getMediaKey(nft);
  };

  return (
    <>
      {visibleNFTs.map((nft, index) => (
        <NFTCard
          key={generateUniqueNFTKey(nft)}
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
    </>
  );
};
