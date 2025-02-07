'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Player } from './player/Player';
import { BottomNav } from './navigation/BottomNav';
import HomeView from './views/HomeView';
import ExploreView from './views/ExploreView';
import LibraryView from './views/LibraryView';
import ProfileView from './views/ProfileView';
import Image from 'next/image';
import { processMediaUrl } from '../utils/media';
import {
  getRecentSearches,
  getTopPlayedNFTs,
  trackUserSearch,
  trackNFTPlay,
  fetchNFTDetails,
  getLikedNFTs,
  searchUsers,
  addLikedNFT,
  removeLikedNFT,
  fetchUserNFTs
} from '../lib/firebase';
import { fetchUserNFTsFromAlchemy } from '../lib/alchemy';
import type { NFT, FarcasterUser, SearchedUser, UserContext, LibraryViewProps, ProfileViewProps, NFTFile } from '../types/user';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

const NFT_CACHE_KEY = 'podplayr_nft_cache_';
const TWO_HOURS = 2 * 60 * 60 * 1000;

interface DemoProps {
  fid?: number;
}

interface PageState {
  isHome: boolean;
  isExplore: boolean;
  isLibrary: boolean;
  isProfile: boolean;
}

const Demo: React.FC<DemoProps> = ({ fid = 1 }) => {
  const {
    isPlaying,
    currentPlayingNFT,
    currentlyPlaying,
    audioProgress,
    audioDuration,
    handlePlayAudio,
    handlePlayPause,
    handlePlayNext,
    handlePlayPrevious,
    handleSeek,
    audioRef
  } = useAudioPlayer({ fid });

  const [currentPage, setCurrentPage] = useState<PageState>({
    isHome: true,
    isExplore: false,
    isLibrary: false,
    isProfile: false
  });

  const [isPlayerMinimized, setIsPlayerMinimized] = useState(true);
  const [memoizedAudioDurations, setMemoizedAudioDurations] = useState(0);
  const [recentlyPlayedNFTs, setRecentlyPlayedNFTs] = useState<NFT[]>([]);
  const [topPlayedNFTs, setTopPlayedNFTs] = useState<{ nft: NFT; count: number }[]>([]);
  const [searchResults, setSearchResults] = useState<FarcasterUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<FarcasterUser | null>(null);
  const [userNFTs, setUserNFTs] = useState<NFT[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<NFT[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchedUser[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [userData, setUserData] = useState<FarcasterUser | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setIsPlayerMinimized(true);
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [topPlayed, searches] = await Promise.all([
          getTopPlayedNFTs(),
          getRecentSearches(fid)
        ]);
        setTopPlayedNFTs(topPlayed);
        setRecentSearches(searches || []); // Handle potential undefined
      } catch (error) {
        console.error('Error loading initial data:', error);
        setError('Failed to load initial data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [fid]);

  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (fid) {
        try {
          console.log('Loading liked NFTs for user:', fid);
          const liked = await getLikedNFTs(fid);
          console.log('Loaded liked NFTs:', liked);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
          setError('Failed to load liked NFTs');
        }
      }
    };

    loadLikedNFTs();
  }, [fid]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log('Fetching user data for FID:', fid);
        // Get Farcaster user data
        const user = await trackUserSearch('goldie', fid);
        console.log('Received user data:', user);
        setUserData(user);

        // Get both custody and verified addresses
        const addresses = [
          user.custody_address,
          ...(user.verified_addresses?.eth_addresses || [])
        ].filter(Boolean) as string[];

        console.log('Found addresses:', addresses);

        if (addresses.length === 0) {
          console.error('No wallet addresses found for user');
          return;
        }

        // Try to get cached NFTs first
        const cachedNFTs = getCachedNFTs(fid);
        if (cachedNFTs) {
          console.log('Using cached NFTs:', cachedNFTs.length);
          // Inspect the cached NFTs
          console.log('Sample of cached NFTs:', cachedNFTs.slice(0, 5).map(nft => ({
            name: nft.name,
            contract: nft.contract,
            tokenId: nft.tokenId,
            hasValidAudio: nft.hasValidAudio,
            isVideo: nft.isVideo,
            audio: nft.audio,
            animation_url: nft.metadata?.animation_url,
            properties: nft.metadata?.properties
          })));
          
          // Clear cache if NFTs don't have the right structure
          const hasValidStructure = cachedNFTs.every(nft => 
            typeof nft.contract === 'string' && 
            typeof nft.tokenId === 'string' &&
            typeof nft.metadata === 'object'
          );
          
          if (!hasValidStructure) {
            console.log('Cached NFTs have invalid structure, clearing cache...');
            localStorage.removeItem(`${NFT_CACHE_KEY}${fid}`);
          } else {
            setUserNFTs(cachedNFTs);
            return;
          }
        }

        // Fetch NFTs from all addresses
        console.log('Fetching NFTs from addresses:', addresses);
        const nftPromises = addresses.map(address => 
          fetchUserNFTsFromAlchemy(address)
        );

        const nftResults = await Promise.all(nftPromises);
        console.log('NFT results from each address:', nftResults.map(nfts => nfts.length));
        
        // Combine all NFTs and remove duplicates by contract+tokenId
        const allNFTs = nftResults.flat();
        console.log('Total NFTs before deduplication:', allNFTs.length);

        const uniqueNFTs = allNFTs.reduce((acc, nft) => {
          const key = `${nft.contract}-${nft.tokenId}`;
          if (!acc[key]) {
            acc[key] = nft;
          }
          return acc;
        }, {} as Record<string, NFT>);

        const combinedNFTs = Object.values(uniqueNFTs);
        console.log('Final unique NFTs:', combinedNFTs.length);
        console.log('Sample of fetched NFTs:', combinedNFTs.slice(0, 5).map(nft => ({
          name: nft.name,
          contract: nft.contract,
          tokenId: nft.tokenId,
          hasValidAudio: nft.hasValidAudio,
          isVideo: nft.isVideo,
          audio: nft.audio,
          animation_url: nft.metadata?.animation_url,
          properties: nft.metadata?.properties
        })));

        // Cache the NFTs
        cacheNFTs(fid, combinedNFTs);
        
        // Set the NFTs in state
        setUserNFTs(combinedNFTs);

      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to fetch user data');
      }
    };

    if (fid) {
      console.log('Starting fetchUserData with FID:', fid);
      fetchUserData();
    }
  }, [fid]);

  useEffect(() => {
    const filterMediaNFTs = userNFTs.filter(nft => {
      console.log('Checking NFT for media:', {
        name: nft.name,
        audio: nft.audio,
        animation_url: nft.metadata?.animation_url,
        hasValidAudio: nft.hasValidAudio,
        isVideo: nft.isVideo
      });

      // Check for audio in metadata
      const hasAudio = nft.hasValidAudio || 
        nft.audio || 
        (nft.metadata?.animation_url && (
          nft.metadata.animation_url.toLowerCase().endsWith('.mp3') ||
          nft.metadata.animation_url.toLowerCase().endsWith('.wav') ||
          nft.metadata.animation_url.toLowerCase().endsWith('.m4a') ||
          // Check for common audio content types
          nft.metadata.animation_url.toLowerCase().includes('audio/') ||
          // Some NFTs store audio in IPFS
          nft.metadata.animation_url.toLowerCase().includes('ipfs')
        ));

      // Check for video in metadata
      const hasVideo = nft.isVideo || 
        (nft.metadata?.animation_url && (
          nft.metadata.animation_url.toLowerCase().endsWith('.mp4') ||
          nft.metadata.animation_url.toLowerCase().endsWith('.webm') ||
          nft.metadata.animation_url.toLowerCase().endsWith('.mov') ||
          // Check for common video content types
          nft.metadata.animation_url.toLowerCase().includes('video/')
        ));

      // Also check properties.files if they exist
      const hasMediaInProperties = nft.metadata?.properties?.files?.some((file: NFTFile) => {
        if (!file) return false;
        const fileUrl = (file.uri || file.url || '').toLowerCase();
        const fileType = (file.type || file.mimeType || '').toLowerCase();
        
        return fileUrl.endsWith('.mp3') || 
               fileUrl.endsWith('.wav') || 
               fileUrl.endsWith('.m4a') ||
               fileUrl.endsWith('.mp4') || 
               fileUrl.endsWith('.webm') || 
               fileUrl.endsWith('.mov') ||
               fileType.includes('audio/') ||
               fileType.includes('video/');
      }) ?? false;

      const hasMedia = hasAudio || hasVideo || hasMediaInProperties;
      
      if (hasMedia) {
        console.log('Found media NFT:', { 
          name: nft.name, 
          hasAudio, 
          hasVideo,
          hasMediaInProperties,
          animation_url: nft.metadata?.animation_url,
          files: nft.metadata?.properties?.files
        });
      }

      return hasMedia;
    });

    console.log(`Found ${filterMediaNFTs.length} media NFTs out of ${userNFTs.length} total NFTs`);
    setFilteredNFTs(filterMediaNFTs);
  }, [userNFTs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    const syncVideo = () => {
      if (isPlaying) {
        video.play().catch(console.error);
      } else {
        video.pause();
      }
    };

    syncVideo();

    // Add event listeners to handle video state
    const handlePlay = () => {
      if (!isPlaying) handlePlayPause();
    };
    const handlePause = () => {
      if (isPlaying) handlePlayPause();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [isPlaying, currentPlayingNFT]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlayingNFT?.isVideo) return;

    const syncVideo = () => {
      if (isPlaying) {
        video.play().catch(console.error);
      } else {
        video.pause();
      }
    };

    syncVideo();

    // Keep video in sync with audio progress
    const syncInterval = setInterval(() => {
      if (video && Math.abs(video.currentTime - audioProgress) > 0.5) {
        video.currentTime = audioProgress;
      }
    }, 1000);

    return () => {
      clearInterval(syncInterval);
    };
  }, [isPlaying, currentPlayingNFT, audioProgress]);

  const handleSearch = async (username: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const results = await searchUsers(username);
      const formattedResults: FarcasterUser[] = results.map((user: any) => ({
        fid: user.fid || 0,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp,
        follower_count: 0,
        following_count: 0,
        profile: {
          bio: user.bio
        }
      }));
      setSearchResults(formattedResults);
      await trackUserSearch(username, fid);
      
      // Update recent searches after successful search
      const updatedSearches = await getRecentSearches(fid);
      setRecentSearches(updatedSearches || []);
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to search for users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const findAdjacentNFT = (direction: 'next' | 'previous'): NFT | null => {
    if (!currentPlayingNFT) return null;
    
    // Get the current list of NFTs based on the view
    let nftList: NFT[] = [];
    switch (currentPage.isHome) {
      case true:
        nftList = recentlyPlayedNFTs;
        break;
      case false:
        if (currentPage.isExplore) {
          nftList = filteredNFTs;
        } else if (currentPage.isLibrary) {
          nftList = likedNFTs;
        }
        break;
      default:
        return null;
    }

    const currentIndex = nftList.findIndex(
      nft => `${nft.contract}-${nft.tokenId}` === `${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`
    );

    if (currentIndex === -1) return null;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    return nftList[nextIndex] || null;
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  const handleLikeToggle = async (nft: NFT) => {
    if (!fid) {
      console.log('No user logged in');
      return;
    }

    try {
      const isCurrentlyLiked = isNFTLiked(nft);
      console.log('Toggling like for NFT:', {
        contract: nft.contract,
        tokenId: nft.tokenId,
        currentlyLiked: isCurrentlyLiked
      });

      if (isCurrentlyLiked) {
        // Remove from likes
        await removeLikedNFT(fid, nft);
        setLikedNFTs(prev => prev.filter(
          likedNFT => 
            !(likedNFT.contract.toLowerCase() === nft.contract.toLowerCase() && 
            likedNFT.tokenId === nft.tokenId)
        ));
        console.log('NFT removed from likes');
      } else {
        // Add to likes
        await addLikedNFT(fid, nft);
        setLikedNFTs(prev => [...prev, nft]);
        console.log('NFT added to likes');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      setError('Failed to update liked status');
    }
  };

  const isNFTLiked = (nft: NFT): boolean => {
    return likedNFTs.some(item => 
      item.contract.toLowerCase() === nft.contract.toLowerCase() && 
      item.tokenId === nft.tokenId
    );
  };

  const switchPage = (page: keyof PageState) => {
    const newState: PageState = {
      isHome: false,
      isExplore: false,
      isLibrary: false,
      isProfile: false
    };
    newState[page] = true;
    setCurrentPage(newState);
    
    // Reset states when switching pages
    setSelectedUser(null);
    setSearchResults([]);
    setError(null);
  };

  const handleReset = () => {
    setCurrentPage({
      isHome: true,
      isExplore: false,
      isLibrary: false,
      isProfile: false
    });
    setSelectedUser(null);
    setSearchResults([]);
    setUserNFTs([]);
    setError(null);
  };

  const renderCurrentView = () => {
    if (currentPage.isHome) {
      return (
        <HomeView
          recentlyPlayedNFTs={recentlyPlayedNFTs}
          topPlayedNFTs={topPlayedNFTs}
          onPlayNFT={handlePlayAudio}
          currentlyPlaying={currentlyPlaying}
          isPlaying={isPlaying}
          handlePlayPause={handlePlayPause}
          isLoading={isLoading}
          onReset={handleReset}
        />
      );
    }
    
    if (currentPage.isExplore) {
      return (
        <ExploreView
          onSearch={handleSearch}
          selectedUser={selectedUser}
          onPlayNFT={handlePlayAudio}
          currentlyPlaying={currentlyPlaying}
          isPlaying={isPlaying}
          searchResults={searchResults}
          nfts={filteredNFTs}
          isSearching={isSearching}
          handlePlayPause={handlePlayPause}
          isLoadingNFTs={isLoading}
          onBack={() => setSelectedUser(null)}
          publicCollections={[]}
          addToPublicCollection={() => { } }
          removeFromPublicCollection={() => { } }
          recentSearches={recentSearches}
          handleUserSelect={(user) => {
            setSelectedUser(user);
            const fetchUserNFTs = async () => {
              setIsLoading(true);
              try {
                setUserNFTs([]);
              } catch (error) {
                console.error('Error fetching user NFTs:', error);
                setError('Failed to fetch user NFTs');
              } finally {
                setIsLoading(false);
              }
            };
            fetchUserNFTs();
          }}
          onReset={handleReset}
        />
      );
    }
    
    if (currentPage.isLibrary) {
      return (
        <LibraryView
          likedNFTs={likedNFTs}
          handlePlayAudio={handlePlayAudio}
          currentlyPlaying={currentlyPlaying}
          isPlaying={isPlaying}
          handlePlayPause={handlePlayPause}
          onReset={handleReset}
        />
      );
    }
    
    if (currentPage.isProfile) {
      return (
        <ProfileView
          userContext={{
            fid,
            username: userData?.username || 'user',
            displayName: userData?.display_name || 'User',
            avatar: userData?.pfp_url || '',
            isAuthenticated: true
          }}
          nfts={filteredNFTs}
          handlePlayAudio={handlePlayAudio}
          isPlaying={isPlaying}
          currentlyPlaying={currentlyPlaying}
          handlePlayPause={handlePlayPause}
          onReset={handleReset}
        />
      );
    }
    
    return null;
  };

  const getCachedNFTs = (userId: number): NFT[] | null => {
    const cached = localStorage.getItem(`${NFT_CACHE_KEY}${userId}`);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TWO_HOURS) {
        return data;
      }
    }
    return null;
  };

  const cacheNFTs = (userId: number, nfts: NFT[]) => {
    localStorage.setItem(
      `${NFT_CACHE_KEY}${userId}`,
      JSON.stringify({ data: nfts, timestamp: Date.now() })
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 container mx-auto px-4 py-6 pb-32">
        {renderCurrentView()}
      </div>

      {/* Audio Element */}
      {currentPlayingNFT && (
        <audio
          ref={audioRef}
          src={processMediaUrl(currentPlayingNFT.audio || currentPlayingNFT.metadata?.animation_url || '', '')}
        />
      )}

      {/* Media Player - Minimized Mode */}
      {currentPlayingNFT && (
        <div className="fixed bottom-[64px] left-0 right-0 bg-black border-t border-purple-400/20 h-20 z-30">
          {/* Progress bar */}
          <div 
            className="absolute top-0 left-0 right-0 h-1 bg-gray-800 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              handleSeek(memoizedAudioDurations * percent);
            }}
          >
            <div 
              className="absolute top-0 left-0 h-0.5 bg-red-500 transition-all duration-100 group-hover:h-1"
              style={{ width: `${(audioProgress / memoizedAudioDurations) * 100}%` }}
            />
          </div>
          
          {/* Player content */}
          <div className="container mx-auto h-full pt-2">
            <div className="flex items-center justify-between h-[calc(100%-8px)] px-4 gap-4">
              {/* Thumbnail and title */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 flex-shrink-0 relative rounded overflow-hidden">
                  {currentPlayingNFT.isVideo ? (
                    <video 
                      ref={videoRef}
                      src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || '', '/placeholder-video.mp4')}
                      className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                      playsInline
                      loop={currentPlayingNFT.isAnimation}
                      muted={true}
                      controls={false}
                      autoPlay={isPlaying}
                    />
                  ) : currentPlayingNFT.isAnimation ? (
                    <Image
                      src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || currentPlayingNFT.metadata?.image || '')}
                      alt={currentPlayingNFT.name}
                      className="w-full h-full object-cover"
                      width={48}
                      height={48}
                      priority={true}
                      unoptimized={true}
                    />
                  ) : (
                    <Image
                      src={processMediaUrl(currentPlayingNFT.metadata?.image || '')}
                      alt={currentPlayingNFT.name}
                      className="w-full h-full object-cover"
                      width={48}
                      height={48}
                      priority={true}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-mono text-purple-400 truncate text-sm">
                    {currentPlayingNFT.name}
                  </h4>
                  <p className="font-mono text-gray-400 truncate text-xs">
                    {currentPlayingNFT.collection?.name}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                {/* Play/Pause Button */}
                <button
                  onClick={handlePlayPause}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                      <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                        <path d="M320-640v320l440 280-440 280Z"/>
                      </svg>
                    </svg>
                  )}
                </button>

                {/* Expand Button */}
                <button
                  onClick={() => setIsPlayerMinimized(false)}
                  className="text-purple-400 hover:text-purple-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                    <path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Player */}
      {currentPlayingNFT && !isPlayerMinimized && (
        <div className="fixed inset-0 bg-black backdrop-blur-md z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-black">
            <button
              onClick={() => setIsPlayerMinimized(true)}
              className="text-purple-400 hover:text-purple-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="m336-280-56-56 184-184-184-184 56-56 240 240-240 240Z"/>
              </svg>
            </button>
            <h3 className="font-mono text-purple-400">Now Playing</h3>
            <div className="w-8"></div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-screen-sm mx-auto px-4 py-8">
              {/* NFT Image/Video Container */}
              <div className="relative w-full mb-8">
                <div className={`transition-all duration-500 ease-in-out transform ${isPlaying ? 'scale-100' : 'scale-90'}`}>
                  {currentPlayingNFT.isVideo || currentPlayingNFT.metadata?.animation_url ? (
                    <video 
                      ref={videoRef}
                      src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || '', '/placeholder-video.mp4')}
                      className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                      playsInline
                      loop={currentPlayingNFT.isAnimation}
                      muted={true}
                      controls={false}
                      autoPlay={isPlaying}
                    />
                  ) : (
                    <Image
                      src={processMediaUrl(currentPlayingNFT.metadata?.image || '')}
                      alt={currentPlayingNFT.name}
                      className="w-full h-auto object-contain rounded-lg transition-transform duration-500"
                      width={500}
                      height={500}
                      priority={true}
                    />
                  )}
                </div>

                {/* Play/Pause Overlay */}
                <div 
                  className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${
                    isPlaying ? 'opacity-0' : 'opacity-100'
                  }`}
                  onClick={handlePlayPause}
                >
                  <div className="transform transition-transform duration-300 hover:scale-110">
                    {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor" className="text-white">
                        <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor" className="text-white">
                        <path d="M320-200v-560l440 280-440 280Z"/>
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              {/* Track Info */}
              <div className="text-center mb-12">
                <h2 className="font-mono text-purple-400 text-xl mb-3">{currentPlayingNFT.name}</h2>
              </div>

              {/* Progress Bar */}
              <div className="mb-12">
                <div 
                  className="h-1.5 bg-gray-800 rounded-full cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    handleSeek(memoizedAudioDurations * percent);
                  }}
                >
                  <div 
                    className="h-full bg-purple-200 rounded-full"
                    style={{ width: `${(audioProgress / memoizedAudioDurations) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-3 font-mono text-gray-400 text-sm">
                  <span>{formatTime(audioProgress)}</span>
                  <span>{formatTime(memoizedAudioDurations)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-8">
                {/* Main Controls */}
                <div className="flex justify-center items-center gap-12">
                  {/* Previous Track */}
                  <button
                    onClick={() => {
                      const previousNFT = findAdjacentNFT('previous');
                      if (previousNFT) {
                        handlePlayAudio(previousNFT);
                      }
                    }}
                    className="text-white hover:scale-110 transition-transform"
                    disabled={!findAdjacentNFT('previous')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" 
                      fill={findAdjacentNFT('previous') ? 'currentColor' : '#666666'}>
                      <path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Z"/>
                    </svg>
                  </button>

                  {/* Play/Pause Button */}
                  <button
                    onClick={handlePlayPause}
                    className="w-20 h-20 rounded-full bg-purple-200 text-black flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor">
                        <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor">
                        <path d="M320-200v-560l440 280-440 280Z"/>
                      </svg>
                    )}
                  </button>

                  {/* Next Track */}
                  <button
                    onClick={() => {
                      const nextNFT = findAdjacentNFT('next');
                      if (nextNFT) {
                        handlePlayAudio(nextNFT);
                      }
                    }}
                    className="text-white hover:scale-110 transition-transform"
                    disabled={!findAdjacentNFT('next')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px"
                      fill={findAdjacentNFT('next') ? 'currentColor' : '#666666'}>
                      <path d="M660-240v-480h80v480h-80ZM220-240v-480l360 240-360 240Z"/>
                    </svg>
                  </button>
                </div>

                {/* Secondary Controls */}
                <div className="flex justify-center items-center gap-8">
                  {/* Like Button */}
                  <button 
                    onClick={() => handleLikeToggle(currentPlayingNFT)}
                    className="text-white hover:scale-110 transition-transform"
                  >
                    {isLiked ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="text-red-500">
                        <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                        <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                      </svg>
                    )}
                  </button>

                  {/* PiP Button */}
                  <button 
                    onClick={togglePictureInPicture}
                    className="text-white hover:scale-110 transition-transform"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                      <path d="M560-120v-80h280v-280h80v360H560Zm-520 0v-360h80v280h280v80H40Zm520-520v-280h280v80H640v200h-80ZM120-640v-200h280v-80H40v280h80Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav
        currentPage={currentPage}
        onNavigate={switchPage}
        onReset={() => {
          setCurrentPage({
            isHome: true,
            isExplore: false,
            isLibrary: false,
            isProfile: false
          });
          setSelectedUser(null);
          setSearchResults([]);
          setUserNFTs([]);
          setError(null);
        }}
      />
    </div>
  );
};

export default Demo;