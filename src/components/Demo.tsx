'use client';

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { FarcasterContext } from '~/app/providers';
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
  toggleLikeNFT,
  fetchUserNFTs
} from '../lib/firebase';
import { fetchUserNFTsFromAlchemy } from '../lib/alchemy';
import type { NFT, FarcasterUser, SearchedUser, UserContext, LibraryViewProps, ProfileViewProps, NFTFile, NFTPlayData, GroupedNFT } from '../types/user';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

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

const Demo: React.FC = () => {
  // 1. Context Hooks
  const { fid } = useContext(FarcasterContext);
  // Assert fid type for TypeScript
  const userFid = fid as number;

  // 2. State Hooks
  const [currentPage, setCurrentPage] = useState<PageState>({
    isHome: true,
    isExplore: false,
    isLibrary: false,
    isProfile: false
  });

  const [isPlayerMinimized, setIsPlayerMinimized] = useState(true);
  const [isInitialPlay, setIsInitialPlay] = useState(false);

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

  const {
    isPlaying,
    currentPlayingNFT,
    currentlyPlaying,
    audioProgress,
    audioDuration,
    handlePlayAudio,
    handlePlayPause,
    handleSeek,
    audioRef
  } = useAudioPlayer({ 
    fid: userFid,
    setRecentlyPlayedNFTs 
  });

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
  }, [userFid]);

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
  }, [userFid]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log('Fetching user data for FID:', userFid);
        // Get Farcaster user data by FID only
        const users = await searchUsers(userFid.toString());
        if (users && users.length > 0) {
          const user = users[0];
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
          const cachedNFTs = getCachedNFTs(userFid);
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
              nft.hasOwnProperty('contract') && 
              nft.hasOwnProperty('tokenId') && 
              nft.hasOwnProperty('metadata')
            );

            if (hasValidStructure) {
              setUserNFTs(cachedNFTs);
              return;
            } else {
              console.log('Cached NFTs have invalid structure, fetching fresh data');
              localStorage.removeItem(`${NFT_CACHE_KEY}${userFid}`);
            }
          }

          // Fetch NFTs for each address
          const nftPromises = addresses.map(address => fetchUserNFTsFromAlchemy(address));
          const nftResults = await Promise.all(nftPromises);
          const allNFTs = nftResults.flat();

          // Cache the NFTs
          localStorage.setItem(`${NFT_CACHE_KEY}${fid}`, JSON.stringify({
            nfts: allNFTs,
            timestamp: Date.now()
          }));

          setUserNFTs(allNFTs);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to fetch user data');
      }
    };

    if (userFid) {
      fetchUserData();
    }
  }, [userFid]);

  useEffect(() => {
    const filterMediaNFTs = () => {
      const filtered = userNFTs.filter((nft) => {
        console.log('Checking NFT for media:', {
          name: nft.name,
          audio: nft.audio,
          animation_url: nft.metadata?.animation_url,
          hasValidAudio: nft.hasValidAudio,
          isVideo: nft.isVideo
        });

        let hasMedia = false;
        
        try {
          // Check for audio in metadata
          const hasAudio = Boolean(nft.hasValidAudio || 
            nft.audio || 
            (nft.metadata?.animation_url && (
              nft.metadata.animation_url.toLowerCase().endsWith('.mp3') ||
              nft.metadata.animation_url.toLowerCase().endsWith('.wav') ||
              nft.metadata.animation_url.toLowerCase().endsWith('.m4a') ||
              // Check for common audio content types
              nft.metadata.animation_url.toLowerCase().includes('audio/') ||
              // Some NFTs store audio in IPFS
              nft.metadata.animation_url.toLowerCase().includes('ipfs')
            )));

          // Check for video in metadata
          const hasVideo = Boolean(nft.isVideo || 
            (nft.metadata?.animation_url && (
              nft.metadata.animation_url.toLowerCase().endsWith('.mp4') ||
              nft.metadata.animation_url.toLowerCase().endsWith('.webm') ||
              nft.metadata.animation_url.toLowerCase().endsWith('.mov') ||
              // Check for common video content types
              nft.metadata.animation_url.toLowerCase().includes('video/')
            )));

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

          hasMedia = hasAudio || hasVideo || hasMediaInProperties;
          
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
        } catch (error) {
          console.error('Error checking media types:', error);
        }

        return hasMedia;
      });

      console.log(`Found ${filtered.length} media NFTs out of ${userNFTs.length} total NFTs`);
      setFilteredNFTs(filtered);
    };

    filterMediaNFTs();
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

  useEffect(() => {
    if (isInitialPlay) {
      console.log('Minimizing player due to initial play');
      setIsPlayerMinimized(true);
    }
  }, [isInitialPlay]);

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
      await trackUserSearch(username, userFid);
      
      // Update recent searches after successful search
      const updatedSearches = await getRecentSearches(userFid);
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
    
    // Determine which list of NFTs we're currently playing from
    let currentList: NFT[] = [];
    
    // Check which section the current NFT is from
    if (recentlyPlayedNFTs.some(nft => 
      nft.contract === currentPlayingNFT.contract && 
      nft.tokenId === currentPlayingNFT.tokenId
    )) {
      currentList = recentlyPlayedNFTs;
    } else if (topPlayedNFTs.some(item => 
      item.nft.contract === currentPlayingNFT.contract && 
      item.nft.tokenId === currentPlayingNFT.tokenId
    )) {
      currentList = topPlayedNFTs.map(item => item.nft);
    } else if (likedNFTs.some(nft => 
      nft.contract === currentPlayingNFT.contract && 
      nft.tokenId === currentPlayingNFT.tokenId
    )) {
      currentList = likedNFTs;
    } else {
      currentList = userNFTs.filter(nft => nft.hasValidAudio);
    }

    if (!currentList.length) return null;

    const currentIndex = currentList.findIndex(
      nft => nft.contract === currentPlayingNFT.contract && 
             nft.tokenId === currentPlayingNFT.tokenId
    );

    if (currentIndex === -1) return null;

    const adjacentIndex = direction === 'next' ? 
      currentIndex + 1 : 
      currentIndex - 1;

    // Handle wrapping around the playlist
    if (adjacentIndex < 0) {
      return currentList[currentList.length - 1];
    } else if (adjacentIndex >= currentList.length) {
      return currentList[0];
    }

    return currentList[adjacentIndex];
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
    try {
      const wasLiked = await toggleLikeNFT(nft, userFid);
      
      if (wasLiked) {
        setLikedNFTs(prev => [...prev, nft]);
        console.log('NFT added to likes');
      } else {
        setLikedNFTs(prev => prev.filter(
          likedNFT => 
            !(likedNFT.contract.toLowerCase() === nft.contract.toLowerCase() && 
            likedNFT.tokenId === nft.tokenId)
        ));
        console.log('NFT removed from likes');
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

  const handlePlayFromLibrary = async (nft: NFT) => {
    console.log('handlePlayFromLibrary called');
    setIsInitialPlay(true);
    await handlePlayAudio(nft);
    setIsInitialPlay(false);
  };

  const handleMinimizeToggle = () => {
    console.log('Demo: handleMinimizeToggle called. Current state:', isPlayerMinimized);
    if (!isInitialPlay) {
      setIsPlayerMinimized(!isPlayerMinimized);
      console.log('Demo: New state will be:', !isPlayerMinimized);
    }
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
          handlePlayAudio={handlePlayFromLibrary}
          currentlyPlaying={currentlyPlaying}
          currentPlayingNFT={currentPlayingNFT}
          isPlaying={isPlaying}
          handlePlayPause={handlePlayPause}
          onReset={handleReset}
          userContext={{
            user: userData ? {
              fid: userFid,
              username: userData.username,
              displayName: userData.display_name,
              pfpUrl: userData.pfp_url,
              custody_address: userData.custody_address,
              verified_addresses: {
                eth_addresses: userData.verified_addresses?.eth_addresses
              }
            } : undefined
          }}
          setIsLiked={setIsLiked}
          setIsPlayerVisible={() => {}}
          setIsPlayerMinimized={setIsPlayerMinimized}
          onLikeToggle={handleLikeToggle}
        />
      );
    }
    
    if (currentPage.isProfile) {
      return (
        <ProfileView
          userContext={{
            user: {
              fid: userFid,
              username: userData?.username,
              displayName: userData?.display_name,
              pfpUrl: userData?.pfp_url,
              custody_address: userData?.custody_address,
              verified_addresses: {
                eth_addresses: userData?.verified_addresses?.eth_addresses
              }
            }
          }}
          nfts={userNFTs}
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

  const fetchRecentlyPlayed = useCallback(async () => {
    if (!userFid) return;

    try {
      const recentlyPlayedCollection = collection(db, 'nft_plays');
      const q = query(
        recentlyPlayedCollection,
        where('fid', '==', userFid),
        orderBy('timestamp', 'desc'),
        limit(12) // Fetch more to account for duplicates
      );

      const querySnapshot = await getDocs(q);
      const seenNFTs = new Set<string>();
      const recentPlays = querySnapshot.docs.reduce((acc: NFT[], doc: QueryDocumentSnapshot<DocumentData>) => {
        const data = doc.data() as NFTPlayData;
        const nftKey = `${data.nftContract}-${data.tokenId}`;
        
        // Only add NFT if we haven't seen it before
        if (!seenNFTs.has(nftKey)) {
          seenNFTs.add(nftKey);
          acc.push({
            contract: data.nftContract || '',
            tokenId: data.tokenId || '',
            name: data.name || '',
            image: data.image || '',
            audio: data.audioUrl || '',
            hasValidAudio: true,
            network: data.network || 'ethereum',
            metadata: {
              image: data.image || '',
              animation_url: data.audioUrl || ''
            }
          } as NFT);
        }
        return acc;
      }, []).slice(0, 8); // Only keep first 8 unique NFTs

      setRecentlyPlayedNFTs(recentPlays);
    } catch (error) {
      console.error('Error fetching recently played:', error);
      // If index error occurs, try fetching without ordering
      if (error instanceof Error && error.toString().includes('index')) {
        try {
          const recentlyPlayedCollection = collection(db, 'nft_plays');
          const fallbackQuery = query(
            recentlyPlayedCollection,
            where('fid', '==', userFid),
            limit(12)
          );
          
          const fallbackSnapshot = await getDocs(fallbackQuery);
          const seenNFTs = new Set<string>();
          const fallbackPlays = fallbackSnapshot.docs.reduce((acc: NFT[], doc: QueryDocumentSnapshot<DocumentData>) => {
            const data = doc.data() as NFTPlayData;
            const nftKey = `${data.nftContract}-${data.tokenId}`;
            
            // Only add NFT if we haven't seen it before
            if (!seenNFTs.has(nftKey)) {
              seenNFTs.add(nftKey);
              acc.push({
                contract: data.nftContract || '',
                tokenId: data.tokenId || '',
                name: data.name || '',
                image: data.image || '',
                audio: data.audioUrl || '',
                hasValidAudio: true,
                network: data.network || 'ethereum',
                metadata: {
                  image: data.image || '',
                  animation_url: data.audioUrl || ''
                }
              } as NFT);
            }
            return acc;
          }, []).slice(0, 8); // Only keep first 8 unique NFTs
          
          setRecentlyPlayedNFTs(fallbackPlays);
        } catch (fallbackError) {
          console.error('Error with fallback query:', fallbackError);
        }
      }
    }
  }, [userFid]);

  useEffect(() => {
    fetchRecentlyPlayed();
  }, [fetchRecentlyPlayed]);

  const handlePlayNext = async () => {
    const nextNFT = findAdjacentNFT('next');
    if (nextNFT) {
      await handlePlayAudio(nextNFT);
    }
  };

  const handlePlayPrevious = async () => {
    const previousNFT = findAdjacentNFT('previous');
    if (previousNFT) {
      await handlePlayAudio(previousNFT);
    }
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
          src={processMediaUrl(currentPlayingNFT.audio || currentPlayingNFT.metadata?.animation_url || '')}
        />
      )}

      {currentPlayingNFT && (
        <Player
          nft={currentPlayingNFT}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onNext={handlePlayNext}
          onPrevious={handlePlayPrevious}
          isMinimized={isPlayerMinimized}
          onMinimizeToggle={handleMinimizeToggle}
          progress={audioProgress}
          duration={audioDuration}
          onSeek={handleSeek}
          onLikeToggle={handleLikeToggle}
          isLiked={isNFTLiked(currentPlayingNFT)}
          onPictureInPicture={togglePictureInPicture}
        />
      )}

      <BottomNav
        currentPage={currentPage}
        onNavigate={switchPage}
        className={isPlayerMinimized ? '' : 'hidden'}
      />
    </div>
  );
};

export default Demo;