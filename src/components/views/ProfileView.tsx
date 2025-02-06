'use client';

import React from 'react';
import Image from 'next/image';
import { NFTCard } from '../nft/NFTCard';
import type { NFT, UserContext } from '../../types/user';

interface ProfileViewProps {
  userContext: UserContext;
  nfts: NFT[];
  handlePlayAudio: (nft: NFT) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  userContext,
  nfts,
  handlePlayAudio,
  isPlaying,
  currentlyPlaying,
  handlePlayPause,
}) => {
  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="flex items-center p-4 space-x-4">
        <Image
          src={userContext.avatar || '/default-avatar.png'}
          alt={userContext.displayName || 'User'}
          width={64}
          height={64}
          className="rounded-full"
        />
        <div>
          <h2 className="text-xl font-bold">{userContext.displayName || 'User'}</h2>
          <p className="text-gray-500">@{userContext.username || 'user'}</p>
        </div>
      </div>

      {/* User's NFTs */}
      <div>
        <h2 className="text-2xl font-bold text-green-400 mb-4">Your NFTs</h2>
        {nfts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {nfts.map((nft) => (
              <NFTCard
                key={`${nft.contract}-${nft.tokenId}`}
                nft={nft}
                onPlay={() => handlePlayAudio(nft)}
                isPlaying={isPlaying && currentlyPlaying === `${nft.contract}-${nft.tokenId}`}
                currentlyPlaying={currentlyPlaying}
                handlePlayPause={handlePlayPause}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-xl text-green-400 mb-2">No NFTs Found</h3>
            <p className="text-gray-400">
              You don't have any music NFTs yet. Start exploring to find some!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileView;