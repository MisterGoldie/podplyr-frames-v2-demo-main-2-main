'use client';

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { FarcasterContext } from '~/app/providers';
import { PlayerWithAds } from './player/PlayerWithAds';
import { getMediaKey } from '~/utils/media';
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
  QueryDocumentSnapshot,
  doc,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserDataLoader } from './data/UserDataLoader';
import { VideoSyncManager } from './media/VideoSyncManager';

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
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));

  // Load liked NFTs when user changes
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userFid) {
        try {
          const liked = await getLikedNFTs(userFid);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [userFid]);

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

  // User data loading is now handled by UserDataLoader component

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

  // Video synchronization is now handled by VideoSyncManager component

  useEffect(() => {
    if (isInitialPlay) {
      console.log('Minimizing player due to initial play');
      setIsPlayerMinimized(true);
    }
  }, [isInitialPlay]);

  const handleSearch = async (username: string) => {
    console.log('=== EXPLORE: Starting user search ===');
    console.log('Search query:', username);
    setIsSearching(true);
    setError(null);
    try {
      console.log('Calling searchUsers...');
      const results = await searchUsers(username);
      console.log('Search results:', results);
      
      const formattedResults: FarcasterUser[] = results.map((user: any) => ({
        fid: user.fid || 0,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url || user.pfp,
        follower_count: 0,
        following_count: 0,
        profile: {
          bio: user.bio
        }
      }));
      console.log('Formatted results:', formattedResults);
      setSearchResults(formattedResults);
      
      console.log('Tracking user search...');
      await trackUserSearch(username, userFid);
      
      // Update recent searches after successful search
      console.log('Updating recent searches...');
      const updatedSearches = await getRecentSearches(userFid);
      console.log('New recent searches:', updatedSearches);
      setRecentSearches(updatedSearches || []);
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to search for users. Please try again.');
    } finally {
      setIsSearching(false);
      console.log('=== EXPLORE: Search completed ===');
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
      if ('pictureInPictureElement' in document && document.pictureInPictureElement) {
        if ('exitPictureInPicture' in document) {
          await document.exitPictureInPicture();
        }
      } else if (videoRef.current && 'requestPictureInPicture' in videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  const handleLikeToggle = async (nft: NFT) => {
    try {
      // toggleLikeNFT will update both global_likes and user's likes collection
      const wasLiked = await toggleLikeNFT(nft, userFid);
      
      // No need to manually update local state since useNFTLikeState handles that
      console.log('Like toggled:', wasLiked ? 'added' : 'removed');

      // Refresh the library view if we're on the library page
      if (currentPage.isLibrary) {
        const updatedLikedNFTs = await getLikedNFTs(userFid);
        setLikedNFTs(updatedLikedNFTs);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      setError('Failed to update liked status');
    }
  };

  const isNFTLiked = (nft: NFT, ignoreCurrentPage: boolean = false): boolean => {
    // If we're in library view and not ignoring current page, all NFTs are liked
    if (currentPage.isLibrary && !ignoreCurrentPage) return true;

    // Otherwise check if it's in the likedNFTs array
    const nftMediaKey = getMediaKey(nft);
    return likedNFTs.some(item => getMediaKey(item) === nftMediaKey);
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

    // Update the NFT list for the new page
    if (page === 'isHome') {
      window.nftList = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
    } else if (page === 'isLibrary') {
      window.nftList = likedNFTs;
    } else if (page === 'isProfile') {
      window.nftList = userNFTs;
    } else if (page === 'isExplore') {
      window.nftList = filteredNFTs;
    }
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
    
    // Reset NFT list to home view
    window.nftList = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
  };

  const handlePlayFromLibrary = async (nft: NFT) => {
    console.log('handlePlayFromLibrary called');
    setIsInitialPlay(true);
    // Set the current list based on the active view
    if (currentPage.isExplore) {
      window.nftList = filteredNFTs;
    } else if (currentPage.isLibrary) {
      window.nftList = likedNFTs;
    } else if (currentPage.isProfile) {
      window.nftList = userNFTs;
    } else if (currentPage.isHome) {
      window.nftList = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
    }
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
          onLikeToggle={handleLikeToggle}
          likedNFTs={likedNFTs}
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
          handleUserSelect={async (user) => {
            setSelectedUser(user);
            setIsLoading(true);
            try {
              // First try to get cached NFTs
              const cachedNFTs = getCachedNFTs(user.fid);
              
              // Track the user search using existing function
              await trackUserSearch(user.username, user.fid);

              if (cachedNFTs && Array.isArray(cachedNFTs)) {
                setUserNFTs(cachedNFTs);
                setIsLoading(false);
                return;
              }

              // If no cache, fetch NFTs from API
              const nfts = await fetchUserNFTs(user.fid);
              if (!nfts) {
                throw new Error('No NFTs returned');
              }
              
              // Cache the NFTs for future use
              cacheNFTs(user.fid, nfts);
              
              // Update state with fetched NFTs
              setUserNFTs(nfts);
            } catch (error) {
              console.error('Error fetching user NFTs:', error);
              setError('Failed to fetch user NFTs');
              setUserNFTs([]); // Set empty array on error
            } finally {
              setIsLoading(false);
            }
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
          onNFTsLoaded={setUserNFTs}
          onLikeToggle={handleLikeToggle}
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
    <div className="min-h-screen flex flex-col no-select">
      {userFid && (
        <UserDataLoader
          userFid={userFid}
          onUserDataLoaded={setUserData}
          onNFTsLoaded={setUserNFTs}
          onLikedNFTsLoaded={setLikedNFTs}
          onError={setError}
        />
      )}
      {currentPlayingNFT?.isVideo && (
        <VideoSyncManager
          videoRef={videoRef}
          currentPlayingNFT={currentPlayingNFT}
          isPlaying={isPlaying}
          audioProgress={audioProgress}
          onPlayPause={handlePlayPause}
        />
      )}
      <div className="flex-1 container mx-auto px-4 py-6 pb-40">
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
        <PlayerWithAds
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
          isLiked={isNFTLiked(currentPlayingNFT, true)} // Always check actual liked state for Player
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
//