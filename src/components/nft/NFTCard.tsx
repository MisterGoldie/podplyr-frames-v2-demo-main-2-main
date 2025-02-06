import { useState } from 'react';
import { NFT } from '../../types/user';
import { NFTImage } from '../media/NFTImage';
import { processMediaUrl } from '../../utils/media';

interface NFTCardProps {
  nft: NFT;
  onPlay: (nft: NFT) => void;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  publicCollections?: string[];
  onAddToCollection?: (nft: NFT, collectionId: string) => void;
  onRemoveFromCollection?: (nft: NFT, collectionId: string) => void;
  viewMode?: 'list' | 'grid';
  badge?: string;
}

export const NFTCard: React.FC<NFTCardProps> = ({ 
  nft, 
  onPlay, 
  isPlaying, 
  currentlyPlaying, 
  handlePlayPause,
  publicCollections,
  onAddToCollection,
  onRemoveFromCollection,
  viewMode = 'grid',
  badge
}) => {
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const isCurrentTrack = currentlyPlaying === `${nft.contract}-${nft.tokenId}`;

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center gap-4 bg-gray-800/20 p-3 rounded-lg hover:bg-gray-800/40 transition-colors">
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
            <div className="absolute top-1 right-1 bg-green-400 text-black text-xs px-1.5 py-0.5 rounded-full">
              {badge}
            </div>
          )}
        </div>
        <div className="flex-grow min-w-0">
          <h3 className="text-green-400 font-mono text-sm truncate">{nft.name}</h3>
          <p className="text-gray-400 text-xs truncate">{nft.description}</p>
        </div>
        <button 
          onClick={() => {
            if (isCurrentTrack) {
              handlePlayPause();
            } else {
              onPlay(nft);
            }
          }}
          className="text-green-400 hover:text-green-300 transition-colors"
        >
          {isCurrentTrack && isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
              <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
              <path d="M320-200v-560l440 280-440 280Z"/>
            </svg>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="group relative bg-gray-800/20 rounded-lg overflow-hidden hover:bg-gray-800/40 transition-colors">
      <div className="aspect-square relative">
        <NFTImage
          nft={nft}
          src={processMediaUrl(nft.image || nft.metadata?.image || '')}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={300}
          height={300}
        />
        {badge && (
          <div className="absolute top-2 right-2 bg-green-400 text-black text-xs px-2 py-1 rounded-full">
            {badge}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-green-400 font-mono text-sm truncate mb-1">{nft.name}</h3>
            <p className="text-gray-400 text-xs truncate">{nft.description}</p>
          </div>
        </div>
        <button 
          onClick={() => {
            if (isCurrentTrack) {
              handlePlayPause();
            } else {
              onPlay(nft);
            }
          }}
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-green-400 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-300"
        >
          {isCurrentTrack && isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
              <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
              <path d="M320-200v-560l440 280-440 280Z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};