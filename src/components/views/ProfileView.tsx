'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { NFTCard } from '../nft/NFTCard';
import type { NFT, UserContext } from '../../types/user';
import { fetchUserNFTs } from '../../lib/nft';

interface ProfileViewProps {
  userContext: UserContext;
  nfts: NFT[];
  handlePlayAudio: (nft: NFT) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  onReset: () => void;
  onNFTsLoaded: (nfts: NFT[]) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  userContext,
  nfts,
  handlePlayAudio,
  isPlaying,
  currentlyPlaying,
  handlePlayPause,
  onReset,
  onNFTsLoaded
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNFTs = async () => {
      if (!userContext.user?.fid) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const nfts = await fetchUserNFTs(userContext.user.fid);
        onNFTsLoaded(nfts);
      } catch (err) {
        console.error('Error loading NFTs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    loadNFTs();
  }, [userContext.user?.fid, onNFTsLoaded]);
  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-black flex items-center justify-center z-50">
        <button 
          onClick={onReset}
          className="cursor-pointer"
        >
          <Image
            src="/fontlogo.png"
            alt="PODPlayr Logo"
            width={120}
            height={30}
            className="logo-image"
            priority={true}
          />
        </button>
      </header>
      <div className="space-y-8 pt-20">
        {/* Profile Header */}
        <div className="flex items-center p-4 space-x-4">
          <Image
            src={userContext.user?.pfpUrl || '/default-avatar.png'}
            alt={userContext.user?.displayName || 'User'}
            width={64}
            height={64}
            className="rounded-full"
          />
          <div>
            <h2 className="text-xl font-bold">{userContext.user?.displayName || 'User'}</h2>
            <p className="text-gray-500">@{userContext.user?.username || 'user'}</p>
          </div>
        </div>

        {/* User's NFTs */}
        <div>
          <h2 className="text-2xl font-bold text-green-400 mb-4">Your NFTs</h2>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-400 mx-auto mb-4"></div>
              <p className="text-green-400">Loading your NFTs...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <h3 className="text-xl text-red-400 mb-2">Error Loading NFTs</h3>
              <p className="text-gray-400">{error}</p>
            </div>
          ) : nfts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {nfts.filter(nft => nft.hasValidAudio).map((nft) => (
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
              <h3 className="text-xl text-green-400 mb-2">No Music NFTs Found</h3>
              <p className="text-gray-400">
                No music NFTs found in your connected wallets. Start exploring to find some!
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProfileView;