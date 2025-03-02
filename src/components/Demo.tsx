'use client';

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { FarcasterContext } from '~/app/providers';
import { PlayerWithAds } from './player/PlayerWithAds';
import { getMediaKey } from '~/utils/media';
import { FEATURED_NFTS } from './sections/FeaturedSection';
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
  subscribeToRecentSearches,
  toggleLikeNFT,
  fetchUserNFTs,
  subscribeToRecentPlays
} from '../lib/firebase';
import { fetchUserNFTsFromAlchemy } from '../lib/alchemy';
import type { NFT, FarcasterUser, SearchedUser, UserContext, LibraryViewProps, ProfileViewProps, NFTFile, NFTPlayData, GroupedNFT } from '../types/user';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useTopPlayedNFTs } from '../hooks/useTopPlayedNFTs';
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
import { videoPerformanceMonitor } from '../utils/videoPerformanceMonitor';

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
  const { topPlayed: topPlayedNFTs, loading: topPlayedLoading } = useTopPlayedNFTs();
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

  // Load liked NFTs and recent searches when user changes
  useEffect(() => {
    let unsubscribeSearches: (() => void) | undefined;

    const loadUserData = async () => {
      if (userFid) {
        try {
          // Load liked NFTs
          const liked = await getLikedNFTs(userFid);
          setLikedNFTs(liked);

          // Load recent searches
          const searches = await getRecentSearches(userFid);
          setRecentSearches(searches);

          // Subscribe to real-time updates for recent searches
          console.log('=== DEMO: Setting up recent searches subscription ===');
          console.log('Current userFid:', userFid);
          
          unsubscribeSearches = subscribeToRecentSearches(userFid, (searches) => {
            console.log('=== DEMO: Recent searches callback triggered ===');
            console.log('New searches:', searches);
            setRecentSearches(searches);
          });
          
          console.log('Subscription set up successfully');
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      }
    };

    loadUserData();

    return () => {
      console.log('=== DEMO: Cleaning up subscriptions ===');
      if (unsubscribeSearches) {
        console.log('Unsubscribing from recent searches');
        unsubscribeSearches();
      }
    };
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
        // Get recent searches
        const searches = await getRecentSearches(fid);
        setRecentSearches(searches || []); // Handle potential undefined

        // Subscribe to recently played NFTs
        if (userFid) {
          const unsubscribe = subscribeToRecentPlays(userFid, (nfts) => {
            setRecentlyPlayedNFTs(nfts);
          });
          return () => unsubscribe();
        }
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

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const findAdjacentNFT = (direction: 'next' | 'previous'): NFT | null => {
    if (!currentPlayingNFT) return null;
    
    // Determine which list to use based on the current context
    let currentList: NFT[] = [];
    
    // Check if we're playing from top played section
    if (topPlayedNFTs.some(item => 
      getMediaKey(item.nft) === getMediaKey(currentPlayingNFT)
    )) {
      currentList = topPlayedNFTs.map(item => item.nft);
      console.log('Playing from Top Played section');
    }
    // Check if we're playing from featured section
    else if (FEATURED_NFTS.some((nft: NFT) => 
      getMediaKey(nft) === getMediaKey(currentPlayingNFT)
    )) {
      currentList = FEATURED_NFTS;
      console.log('Playing from Featured section');
    }
    // Otherwise use the window.nftList for other views
    else if (window.nftList) {
      currentList = window.nftList;
      console.log('Playing from main list');
    }
    
    if (!currentList.length) {
      console.log('No NFTs in current list');
      return null;
    }

    // Find the current NFT in the list using mediaKey for consistent matching
    const currentMediaKey = getMediaKey(currentPlayingNFT);
    const currentIndex = currentList.findIndex(nft => getMediaKey(nft) === currentMediaKey);

    if (currentIndex === -1) {
      console.log('Current NFT not found in list');
      return null;
    }

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
    console.log('⭐ handleLikeToggle called with:', { 
      nftName: nft.name, 
      userFid, 
      contract: nft.contract, 
      tokenId: nft.tokenId 
    });
    
    if (!userFid || userFid <= 0) {
      console.error('❌ Cannot toggle like: Invalid userFid', userFid);
      setError('Login required to like NFTs');
      return;
    }
    
    try {
      console.log('📝 Calling toggleLikeNFT...');
      // toggleLikeNFT will update both global_likes and user's likes collection
      const wasLiked = await toggleLikeNFT(nft, userFid);
      
      // No need to manually update local state since useNFTLikeState handles that
      console.log(`✅ Like toggled: ${wasLiked ? 'added' : 'removed'}`);

      // Refresh the library view if we're on the library page
      if (currentPage.isLibrary) {
        console.log('🔄 Refreshing liked NFTs for library view...');
        const updatedLikedNFTs = await getLikedNFTs(userFid);
        setLikedNFTs(updatedLikedNFTs);
      }
    } catch (error) {
      console.error('❌ Error toggling like:', error);
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

  const handleSearch = async (username: string) => {
    setIsSearching(true);
    try {
      const results = await searchUsers(username);
      
      // IMPORTANT: If there's only one result, bypass search results completely
      if (results.length === 1) {
        await handleDirectUserSelect(results[0]);
        return; // Skip setting searchResults at all
      }
      
      // Otherwise, if multiple results
      setSearchResults(results);
      setSelectedUser(null); // Clear any selected user
    } catch (error) {
      console.error('Error searching users:', error);
      setError('Error searching users');
    } finally {
      setIsSearching(false);
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
              
              // Track the user search and get updated search data
              await trackUserSearch(user.username, userFid);
              
              // Immediately refresh recent searches
              const updatedSearches = await getRecentSearches(userFid);
              setRecentSearches(updatedSearches);

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
              
              // Enhanced debugging for NFT count issues
              console.log(`==== ENHANCED NFT COUNT DEBUGGING ====`);
              console.log(`Total raw NFTs from API for ${user.username}:`, nfts.length);
              
              // Count by media type
              const audioNFTs = nfts.filter(nft => nft.hasValidAudio).length;
              const videoNFTs = nfts.filter(nft => nft.isVideo).length;
              const bothTypes = nfts.filter(nft => nft.hasValidAudio && nft.isVideo).length; 
              
              console.log(`NFTs with audio:`, audioNFTs);
              console.log(`NFTs with video:`, videoNFTs);
              console.log(`NFTs with both audio+video:`, bothTypes);
              console.log(`Total media NFTs (audio+video-both):`, audioNFTs + videoNFTs - bothTypes);
              console.log(`=== CONTRACT ADDRESSES ===`);
              const contractCounts: Record<string, number> = {};
              nfts.forEach(nft => {
                if (nft.contract) {
                  contractCounts[nft.contract] = (contractCounts[nft.contract] || 0) + 1;
                }
              });
              console.log(contractCounts);
              console.log(`========================================`);
              
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
          handleDirectUserSelect={handleDirectUserSelect}
          onLikeToggle={handleLikeToggle}
          isNFTLiked={isNFTLiked}
          userFid={userFid}
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

  const prepareAndPlayAudio = async (nft: NFT) => {
    console.log('Demo: prepareAndPlayAudio called with NFT:', nft.name);
    
    // Set the current queue based on the active view
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
      console.log('Setting queue from Explore page with', currentQueue.length, 'NFTs');
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
      console.log('Setting queue from Library page with', currentQueue.length, 'NFTs');
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
      console.log('Setting queue from Profile page with', currentQueue.length, 'NFTs');
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
      console.log('Setting queue from Home page with', currentQueue.length, 'NFTs');
    }
    
    // Update the global nftList for next/previous navigation
    window.nftList = currentQueue;
    
    try {
      // Call the original handlePlayAudio from useAudioPlayer
      await handlePlayAudio(nft);
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handlePlayNext = async () => {
    console.log('Demo: handlePlayNext called');
    
    if (!currentPlayingNFT) return;
    
    // Get the appropriate queue based on current page
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
      console.log('Using Explore page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
      console.log('Using Library page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
      console.log('Using Profile page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
      console.log('Using Home page queue with', currentQueue.length, 'NFTs');
    }
    
    // Find current NFT index in the queue
    const currentIndex = currentQueue.findIndex(
      nft => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );
    
    console.log('Current NFT index in queue:', currentIndex);
    
    if (currentIndex === -1 || currentQueue.length === 0) {
      console.log('Current NFT not found in queue or queue is empty');
      return;
    }
    
    // Get next NFT with wraparound
    const nextIndex = (currentIndex + 1) % currentQueue.length;
    const nextNFT = currentQueue[nextIndex];
    
    console.log('Playing next NFT:', nextNFT.name, 'at index', nextIndex);
    
    // Play the next NFT
    await prepareAndPlayAudio(nextNFT);
  };

  const handlePlayPrevious = async () => {
    console.log('Demo: handlePlayPrevious called');
    
    if (!currentPlayingNFT) return;
    
    // Get the appropriate queue based on current page
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
      console.log('Using Explore page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
      console.log('Using Library page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
      console.log('Using Profile page queue with', currentQueue.length, 'NFTs');
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
      console.log('Using Home page queue with', currentQueue.length, 'NFTs');
    }
    
    // Find current NFT index in the queue
    const currentIndex = currentQueue.findIndex(
      nft => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );
    
    console.log('Current NFT index in queue:', currentIndex);
    
    if (currentIndex === -1 || currentQueue.length === 0) {
      console.log('Current NFT not found in queue or queue is empty');
      return;
    }
    
    // Get previous NFT with wraparound
    const prevIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    const prevNFT = currentQueue[prevIndex];
    
    console.log('Playing previous NFT:', prevNFT.name, 'at index', prevIndex);
    
    // Play the previous NFT
    await prepareAndPlayAudio(prevNFT);
  };

  // Add this helper function to release resources from videos
  const releaseVideoResources = useCallback(() => {
    // Just pause videos that aren't playing, don't try to unload resources
    const allVideos = document.querySelectorAll('video');
    const currentId = currentPlayingNFT ? `video-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}` : null;
    
    allVideos.forEach(video => {
      if (video.id !== currentId && !video.paused) {
        try {
          // Just pause the video - don't overcomplicate
          video.pause();
        } catch (e) {
          // Ignore errors
        }
      }
    });
  }, [currentPlayingNFT]);

  // Add a function to handle direct video playback
  const handleDirectVideoPlayback = useCallback((nft: NFT) => {
    if (!nft.isVideo) return;
    
    // Find all video elements
    const videos = document.querySelectorAll('video');
    const targetVideoId = `video-${nft.contract}-${nft.tokenId}`;
    
    // Simply pause all other videos and play the target
    videos.forEach(video => {
      const isTarget = video.id === targetVideoId;
      
      if (isTarget) {
        // For the target video, just try to play it directly
        try {
          // First try unmuted
          video.muted = false;
          video.play().catch(() => {
            // If that fails (expected on mobile), fall back to muted
            video.muted = true;
            video.play().catch(() => {
              console.log('Failed to play video even when muted');
            });
          });
        } catch (e) {
          console.log('Error playing video:', e);
        }
      } else {
        // Just pause other videos
        try {
          if (!video.paused) {
            video.pause();
          }
        } catch (e) {
          // Ignore errors
        }
      }
    });
  }, []);

  // IMPORTANT: Instead of replacing handlePlayAudio, modify the existing useAudioPlayer hook's function
  // Find the useEffect that runs when currentPlayingNFT changes, and add this code:
  useEffect(() => {
    if (currentPlayingNFT) {
      // When a new NFT starts playing, pause others
      releaseVideoResources();
      
      // Add direct video playback handling
      if (currentPlayingNFT.isVideo) {
        handleDirectVideoPlayback(currentPlayingNFT);
      }
    }
  }, [currentPlayingNFT, releaseVideoResources, handleDirectVideoPlayback]);

  useEffect(() => {
    // Initialize video performance monitor on mount
    videoPerformanceMonitor.init();
  }, []);
  // Add this near your NFT processing code to reduce redundant checks
  const processNFTs = useCallback((nfts: any[]) => {
    // Use a Set to track media keys we've already processed
    const processedMediaKeys = new Set();
    const mediaOnly = [];

    // Process each NFT just once with a single pass
    for (const nft of nfts) {
      const mediaKey = getMediaKey(nft);
      
      // Skip if we've already processed this NFT
      if (processedMediaKeys.has(mediaKey)) continue;
      processedMediaKeys.add(mediaKey);
      
      // Determine if it's a media NFT with a single consolidated check
      const isMediaNFT = (
        (nft.animation_url || nft.metadata?.animation_url || nft.audio) && 
        (
          nft.audio || 
          (nft.animation_url?.toLowerCase().match(/\.(mp3|wav|ogg|mp4|webm)$/)) ||
          (nft.metadata?.animation_url?.toLowerCase().match(/\.(mp3|wav|ogg|mp4|webm)$/))
        )
      );
      
      if (isMediaNFT) {
        // Configure NFT properties in one pass
        nft.isVideo = nft.animation_url?.toLowerCase().match(/\.(mp4|webm)$/) || 
                      nft.metadata?.animation_url?.toLowerCase().match(/\.(mp4|webm)$/);
        nft.hasValidAudio = Boolean(nft.audio || 
                           nft.animation_url?.toLowerCase().match(/\.(mp3|wav|ogg)$/) ||
                           nft.metadata?.animation_url?.toLowerCase().match(/\.(mp3|wav|ogg)$/));
        
        mediaOnly.push(nft);
      }
    }
    
    return mediaOnly;
  }, []);

  // Add a direct wallet search function that bypasses search results
  const handleDirectUserSelect = async (user: FarcasterUser) => {
    console.log('=== DEMO: Direct wallet search ===');
    console.log('Selected user:', user);
    
    // IMPORTANT: First set search results to empty array
    // This must be done before setting selectedUser
    setSearchResults([]);
    
    // Then track the search
    if (userFid) {
      await trackUserSearch(user.username, userFid);
      
      // Get updated recent searches
      const searches = await getRecentSearches(userFid);
      setRecentSearches(searches);
    }
    
    // Now set selected user AFTER clearing search results
    setSelectedUser(user);
    
    // Continue with wallet search
    setIsLoading(true);
    try {
      // Load NFTs for this user directly from Farcaster API/database
      const nfts = await fetchUserNFTs(user.fid);
      
      // Enhanced debugging for NFT count issues
      console.log(`==== ENHANCED NFT COUNT DEBUGGING ====`);
      console.log(`Total raw NFTs from API for ${user.username}:`, nfts.length);
      
      // Count by media type
      const audioNFTs = nfts.filter(nft => nft.hasValidAudio).length;
      const videoNFTs = nfts.filter(nft => nft.isVideo).length;
      const bothTypes = nfts.filter(nft => nft.hasValidAudio && nft.isVideo).length; 
      
      console.log(`NFTs with audio:`, audioNFTs);
      console.log(`NFTs with video:`, videoNFTs);
      console.log(`NFTs with both audio+video:`, bothTypes);
      console.log(`Total media NFTs (audio+video-both):`, audioNFTs + videoNFTs - bothTypes);
      console.log(`=== CONTRACT ADDRESSES ===`);
      const contractCounts: Record<string, number> = {};
      nfts.forEach(nft => {
        if (nft.contract) {
          contractCounts[nft.contract] = (contractCounts[nft.contract] || 0) + 1;
        }
      });
      console.log(contractCounts);
      console.log(`========================================`);
      
      setUserNFTs(nfts);
      setFilteredNFTs(nfts);
      
      // Update global NFT list for player
      window.nftList = nfts;
      
      setError(null);
    } catch (error) {
      console.error('Error loading user NFTs:', error);
      setError('Error loading NFTs');
    } finally {
      setIsLoading(false);
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
      <div className="flex-1 container mx-auto px-4 py-6 pb-40">
        {renderCurrentView()}
      </div>

      {/* Audio Element */}
      {currentPlayingNFT && (
        <audio
          ref={audioRef as React.RefObject<HTMLAudioElement>}
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

      {/* Only use VideoSyncManager for special cases */}
      {currentPlayingNFT?.isVideo && 
       !currentPlayingNFT.metadata?.animation_url?.match(/\.(mp4|webm|mov)$/i) && (
        <VideoSyncManager
          videoRef={videoRef}
          currentPlayingNFT={currentPlayingNFT}
          isPlaying={isPlaying}
          audioProgress={audioProgress}
          onPlayPause={handlePlayPause}
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
