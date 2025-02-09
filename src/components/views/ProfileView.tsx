'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { NFTCard } from '../nft/NFTCard';
import type { NFT, UserContext } from '../../types/user';
import { getLikedNFTs } from '../../lib/firebase';
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
  onLikeToggle: (nft: NFT) => Promise<void>;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  userContext,
  nfts,
  handlePlayAudio,
  isPlaying,
  currentlyPlaying,
  handlePlayPause,
  onReset,
  onNFTsLoaded,
  onLikeToggle
}) => {
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>([]);

  // Load liked NFTs when user changes
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userContext?.user?.fid) {
        try {
          const liked = await getLikedNFTs(userContext.user.fid);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [userContext?.user?.fid]);
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
      <div className="space-y-8 pt-20 pb-48 overflow-y-auto h-screen overscroll-y-contain">
        {/* Profile Header */}
        <div className="relative flex flex-col items-center text-center p-8 space-y-6 bg-gradient-to-br from-blue-600/40 via-purple-600/30 to-pink-600/40 rounded-3xl mx-4 backdrop-blur-lg w-[340px] h-[280px] mx-auto border border-purple-400/20 shadow-xl shadow-purple-900/30 overflow-hidden hover:border-indigo-400/30 transition-all duration-300">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 via-purple-500/15 to-pink-500/20 blur-2xl rounded-full -z-10 animate-pulse"></div>
          {/* Floating music notes */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute text-2xl text-purple-400/30 animate-float-slow top-12 left-8">
              ♪
            </div>
            <div className="absolute text-3xl text-purple-400/25 animate-float-slower top-32 right-12">
              ♫
            </div>
            <div className="absolute text-2xl text-purple-400/20 animate-float-medium top-48 left-16">
              ♩
            </div>
            <div className="absolute text-2xl text-purple-400/35 animate-float-fast right-8 top-24">
              ♪
            </div>
            <div className="absolute text-3xl text-purple-400/15 animate-float-slowest left-24 top-6">
              ♫
            </div>
          </div>
          <div className="relative">
            <Image
              src={userContext.user?.pfpUrl || '/default-avatar.png'}
              alt={userContext.user?.displayName || 'User'}
              width={120}
              height={120}
              className="rounded-full ring-4 ring-purple-400/20"
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-mono text-purple-400 font-bold">{userContext.user?.displayName || 'User'}</h2>
            <p className="text-lg text-purple-300/60">@{userContext.user?.username || 'user'}</p>
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
              {nfts.map((nft, index) => {
                const nftKey = nft.contract && nft.tokenId ? 
                  `${nft.contract}-${nft.tokenId}` : 
                  `nft-${index}-${nft.name}`;
                
                return (
                  <NFTCard
                    key={nftKey}
                    nft={nft}
                    onPlay={() => handlePlayAudio(nft)}
                    isPlaying={isPlaying && currentlyPlaying === nftKey}
                    currentlyPlaying={currentlyPlaying}
                    handlePlayPause={handlePlayPause}
                    onLikeToggle={() => onLikeToggle(nft)}
                    isLiked={likedNFTs.some(likedNft => 
                      likedNft.contract === nft.contract && likedNft.tokenId === nft.tokenId
                    )}
                    showTitleOverlay={true}
                    useCenteredPlay={true}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-xl text-red-500 mb-2">No Media NFTs Found</h3>
              <p className="text-gray-400">
                No media NFTs found in your connected wallets
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProfileView;