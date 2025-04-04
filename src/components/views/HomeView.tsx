'use client';

import React, { useMemo, useContext, useState, useEffect } from 'react';
import { NFTCard } from '../nft/NFTCard';
import type { NFT } from '../../types/user';
import Image from 'next/image';
import { useNFTPreloader } from '../../hooks/useNFTPreloader';
import FeaturedSection from '../sections/FeaturedSection';
import { getMediaKey } from '../../utils/media';
import { FarcasterContext } from '../../app/providers';
import NotificationHeader from '../NotificationHeader';
import NFTNotification from '../NFTNotification';
import { useNFTNotification } from '../../context/NFTNotificationContext';
import { logger } from '../../utils/logger';
import { predictivePreload } from '../../utils/videoPreloader';

// Create a dedicated logger for the HomeView
const homeLogger = logger.getModuleLogger('homeView');

interface HomeViewProps {
  recentlyPlayedNFTs: NFT[];
  topPlayedNFTs: { nft: NFT; count: number }[];
  onPlayNFT: (nft: NFT, context?: { queue?: NFT[], queueType?: string }) => void;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  handlePlayPause: () => void;
  isLoading?: boolean;
  onReset: () => void;
  onLikeToggle: (nft: NFT) => Promise<void>;
  likedNFTs: NFT[];
  hasActivePlayer: boolean;
}

const HomeView: React.FC<HomeViewProps> = ({
  recentlyPlayedNFTs,
  topPlayedNFTs,
  onPlayNFT,
  currentlyPlaying,
  isPlaying,
  handlePlayPause,
  isLoading = false,
  onReset,
  onLikeToggle,
  likedNFTs,
  hasActivePlayer = false,
}) => {
  // Get NFT notification context (use directly for instant notifications)
  const { showNotification } = useNFTNotification();

  // Initialize featured NFTs once on mount
  useEffect(() => {
    const initializeFeaturedNFTs = async () => {
      const { ensureFeaturedNFTsExist } = await import('../../lib/firebase');
      const { FEATURED_NFTS } = await import('../sections/FeaturedSection');
      await ensureFeaturedNFTsExist(FEATURED_NFTS);
    };

    initializeFeaturedNFTs();
  }, []);

  // Combine all NFTs that need preloading
  const allNFTs = useMemo(() => {
    const nfts = [...recentlyPlayedNFTs];
    topPlayedNFTs.forEach(({ nft }) => {
      if (!nfts.some(existing => 
        existing.contract === nft.contract && 
        existing.tokenId === nft.tokenId
      )) {
        nfts.push(nft);
      }
    });
    return nfts;
  }, [recentlyPlayedNFTs, topPlayedNFTs]);
  
  // Preload videos for recently played and top played NFTs when they're loaded
  useEffect(() => {
    if (recentlyPlayedNFTs.length > 0) {
      homeLogger.info('Starting predictive preload for recently played NFTs');
      predictivePreload(recentlyPlayedNFTs, -1); // Start preloading from beginning
    }
    
    if (topPlayedNFTs.length > 0) {
      homeLogger.info('Starting predictive preload for top played NFTs');
      // Convert from {nft, count} format to just NFT array
      const topPlayedNftArray = topPlayedNFTs.map(item => item.nft);
      predictivePreload(topPlayedNftArray, -1); // Start preloading from beginning
    }
  }, [recentlyPlayedNFTs, topPlayedNFTs]);

  // Preload all NFT images
  useNFTPreloader(allNFTs);

  // Directly check if an NFT is liked by comparing against likedNFTs prop
  // This is more reliable than depending on context or hooks
  const checkDirectlyLiked = (nftToCheck: NFT): boolean => {
    if (!nftToCheck || !nftToCheck.contract || !nftToCheck.tokenId) return false;
    
    const nftKey = `${nftToCheck.contract}-${nftToCheck.tokenId}`.toLowerCase();
    
    // Direct comparison with likedNFTs prop from Demo.tsx
    return likedNFTs.some(likedNFT => 
      `${likedNFT.contract}-${likedNFT.tokenId}`.toLowerCase() === nftKey
    );
  };

  // Get user's FID from context
  const { fid: userFid = 0 } = useContext(FarcasterContext);

  // Create a wrapper for the existing like function that shows notification IMMEDIATELY
  const handleNFTLike = async (nft: NFT): Promise<void> => {
    // Check if the NFT is already liked BEFORE toggling
    const wasLiked = checkDirectlyLiked(nft);
    
    // Show notification with a small delay to sync with heart icon animation
    // This ensures the notification appears after the heart turns red
    const notificationType = !wasLiked ? 'like' : 'unlike';
    
    // Add a small delay (150ms) to match the heart animation timing
    setTimeout(() => {
      showNotification(notificationType, nft);
    }, 150); // Timing synchronized with heart icon animation
    
    // Call the original like function to toggle the status in the background
    // Don't await this - let it happen in the background while notification shows
    if (onLikeToggle) {
      onLikeToggle(nft).catch(error => {
        console.error('Error toggling like status:', error);
      });
    }
  };

  // Filter out invalid NFTs from recently played
  const validRecentlyPlayedNFTs = useMemo(() => {
    return recentlyPlayedNFTs.filter(nft => {
      // Basic validation
      if (!nft) return false;
      
      // Check for critical display properties
      const hasDisplayInfo = Boolean(
        nft.name || (nft.contract && nft.tokenId)
      );
      
      // Check for media
      const hasMedia = Boolean(
        nft.image || 
        nft.metadata?.image ||
        nft.audio ||
        nft.metadata?.animation_url
      );
      
      // Log invalid NFTs
      if (!hasDisplayInfo || !hasMedia) {
        homeLogger.warn('Filtering invalid NFT from recently played:', {
          nft,
          reason: !hasDisplayInfo ? 'missing display info' : 'missing media'
        });
      }
      
      return hasDisplayInfo && hasMedia;
    });
  }, [recentlyPlayedNFTs]);

  if (isLoading) {
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
              className="w-[120px] h-[30px]"
              priority={true}
            />
          </button>
        </header>
        <div className="space-y-8 animate-pulse pt-20">
          <section>
            <div className="h-8 w-48 bg-gray-800 rounded mb-4"></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </section>
          <section>
            <div className="h-8 w-48 bg-gray-800 rounded mb-4"></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </section>
        </div>
      </>
    );
  }

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
      <div 
        className={`space-y-8 pt-20 pb-40 overflow-y-auto overscroll-y-contain ${
          // Use conditional class for height based on player state and screen size
          hasActivePlayer 
            ? 'h-[calc(100vh-130px)] md:h-[calc(100vh-150px)]' // Adjusted height when player active
            : 'h-screen' // Full height when no player
        }`}
      >
        {/* Notifications are now handled by the global NFTNotification component */}

        {/* Recently Played Section */}
        <section>
          {validRecentlyPlayedNFTs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-mono text-green-400 mb-6">Recently Played</h2>
              <div className="relative">
                <div className="overflow-x-auto pb-4 hide-scrollbar">
                  <div className="flex gap-4">
                    {/* Extra deduplicate by contract+tokenId to ensure no duplicates */}
                    {validRecentlyPlayedNFTs
                      .filter((nft, index, self) => {
                        const key = `${nft.contract}-${nft.tokenId}`.toLowerCase();
                        return index === self.findIndex(n => 
                          `${n.contract}-${n.tokenId}`.toLowerCase() === key
                        );
                      })
                      .map((nft, index) => {
                      // Generate strictly unique key that doesn't depend on content
                      const uniqueKey = nft.contract && nft.tokenId 
                        ? `recent-${nft.contract.toLowerCase()}-${nft.tokenId}` 
                        : `recent-fallback-${index}-${Math.random().toString(36).substring(2, 9)}`;
                      
                      return (
                        <div key={uniqueKey} className="flex-shrink-0 w-[140px]">
                          <NFTCard
                            nft={nft}
                            onPlay={async (nft) => {
                              homeLogger.debug(`Play button clicked for NFT in Recently Played: ${nft.name}`);
                              try {
                                // Find this NFT's index in the queue
                                const currentIndex = validRecentlyPlayedNFTs.findIndex(
                                  item => getMediaKey(item) === getMediaKey(nft)
                                );
                                
                                // Predictively preload next few NFTs for smoother playback
                                if (currentIndex !== -1) {
                                  homeLogger.info('Predictively preloading next Recently Played NFTs', {
                                    currentNFT: nft.name,
                                    currentIndex
                                  });
                                  predictivePreload(validRecentlyPlayedNFTs, currentIndex);
                                }
                                
                                // Directly call onPlayNFT with the NFT and context
                                await onPlayNFT(nft, {
                                  queue: validRecentlyPlayedNFTs,
                                  queueType: 'recentlyPlayed'
                                });
                              } catch (error) {
                                homeLogger.error('Error playing NFT from Recently Played:', error);
                              }
                            }}
                            isPlaying={isPlaying && currentlyPlaying === getMediaKey(nft)}
                            currentlyPlaying={currentlyPlaying}
                            handlePlayPause={handlePlayPause}
                            onLikeToggle={() => handleNFTLike(nft)}
                            userFid={userFid}
                            isNFTLiked={() => checkDirectlyLiked(nft)}
                            animationDelay={0.2 + (index * 0.05)}
                            smallCard={true} // Position heart icon properly for smaller cards
                          />
                          <h3 className="font-mono text-white text-sm truncate mt-3">{nft.name}</h3>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Top Played Section */}
        <section>
          {topPlayedNFTs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-mono text-green-400 mb-6">Top Played</h2>
              <div className="relative">
                <div className="overflow-x-auto pb-4 hide-scrollbar">
                  <div className="flex gap-6">
                    {topPlayedNFTs.map(({ nft, count }, index) => {
                      // Generate strictly unique key that doesn't depend on content
                      const uniqueKey = nft.contract && nft.tokenId 
                        ? `top-${nft.contract}-${nft.tokenId}-${index}` 
                        : `top-${index}-${Math.random().toString(36).substr(2, 9)}`;
                      
                      return (
                        <div key={uniqueKey} className="flex-shrink-0 w-[200px]">
                          <NFTCard
                            nft={nft}
                            onPlay={async (nft) => {
                              homeLogger.debug(`Play button clicked for NFT in Top Played: ${nft.name}`);
                              try {
                                // Convert to NFT array for easier handling
                                const topPlayedNftArray = topPlayedNFTs.map(item => item.nft);
                                
                                // Find this NFT's index in the queue
                                const currentIndex = topPlayedNftArray.findIndex(
                                  item => getMediaKey(item) === getMediaKey(nft)
                                );
                                
                                // Predictively preload next few NFTs for smoother playback
                                if (currentIndex !== -1) {
                                  homeLogger.info('Predictively preloading next Top Played NFTs', {
                                    currentNFT: nft.name,
                                    currentIndex
                                  });
                                  predictivePreload(topPlayedNftArray, currentIndex);
                                }
                                
                                // Pass all top played NFTs as the queue context
                                await onPlayNFT(nft, {
                                  queue: topPlayedNftArray,
                                  queueType: 'topPlayed'
                                });
                              } catch (error) {
                                homeLogger.error('Error playing NFT from Top Played:', error);
                              }
                            }}
                            isPlaying={isPlaying && currentlyPlaying === getMediaKey(nft)}
                            currentlyPlaying={currentlyPlaying}
                            handlePlayPause={handlePlayPause}
                            onLikeToggle={() => handleNFTLike(nft)}
                            userFid={userFid}
                            isNFTLiked={() => checkDirectlyLiked(nft)}
                            playCountBadge={`${count} plays`}
                            animationDelay={0.2 + (index * 0.05)}
                          />
                          <h3 className="font-mono text-white text-sm truncate mt-3">{nft.name}</h3>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Featured Section */}
        <section>
          <FeaturedSection
            onPlayNFT={onPlayNFT}
            handlePlayPause={handlePlayPause}
            currentlyPlaying={currentlyPlaying}
            isPlaying={isPlaying}
            onLikeToggle={handleNFTLike}
            isNFTLiked={checkDirectlyLiked}
            userFid={String(userFid)}
          />
        </section>
      </div>
      
      {/* Add NFTNotification component to handle like/unlike notifications */}
      <NFTNotification onReset={onReset} />
    </>
  );
};

export default HomeView;