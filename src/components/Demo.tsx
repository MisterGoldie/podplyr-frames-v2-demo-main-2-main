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
import { AnimatePresence, motion } from 'framer-motion';
import NotificationHeader from './NotificationHeader';
import NFTNotification from './NFTNotification';
import { shouldDelayOperation } from '../utils/videoFirstMode';
import { logger } from '../utils/logger';

const NFT_CACHE_KEY = 'podplayr_nft_cache_';
const TWO_HOURS = 2 * 60 * 60 * 1000;

// Create module-specific loggers for different parts of the Demo component
const demoLogger = logger.getModuleLogger('demo');
const playerLogger = logger.getModuleLogger('player');
const nftLogger = logger.getModuleLogger('nft');

// Detect development environment
const IS_DEV = process.env.NODE_ENV !== 'production';

interface DemoProps {
  fid?: number;
}

interface PageState {
  isHome: boolean;
  isExplore: boolean;
  isLibrary: boolean;
  isProfile: boolean;
}

const pageTransition = {
  duration: 0.3,
  ease: [0.43, 0.13, 0.23, 0.96]
};

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

const Demo: React.FC = () => {
  // NUCLEAR OPTION: Completely disable ALL logging including console
  // WARNING: UNCOMMENT THIS LINE IF STILL SEEING LOGS AFTER OTHER FIXES
  logger.disableAllLogs();
  
  // 1. Context Hooks
  const { fid } = useContext(FarcasterContext);
  // Assert fid type for TypeScript
  const userFid = fid as number;
  
  // Log using the appropriate module logger instead of console.log
  demoLogger.info('Demo component initialized with userFid:', userFid, typeof userFid);
  
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
  // Track the most recently played NFT to prevent duplicates from Firebase subscription
  const recentlyAddedNFT = useRef<string | null>(null);
  
  // Automatically deduplicate the recently played NFTs whenever they change
  useEffect(() => {
    // Add a short delay to allow both updates to come in
    const timeoutId = setTimeout(() => {
      // Deduplicate NFTs based on contract and tokenId
      const uniqueNFTs = recentlyPlayedNFTs.reduce((acc: NFT[], nft) => {
        const key = `${nft.contract}-${nft.tokenId}`.toLowerCase();
        const exists = acc.some(item => 
          `${item.contract}-${item.tokenId}`.toLowerCase() === key
        );
        if (!exists) {
          acc.push(nft);
        }
        return acc;
      }, []);
      
      // Only update if we found duplicates
      if (uniqueNFTs.length !== recentlyPlayedNFTs.length) {
        demoLogger.debug('Deduplicating NFTs', {
          before: recentlyPlayedNFTs.length,
          after: uniqueNFTs.length
        });
        setRecentlyPlayedNFTs(uniqueNFTs);
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [recentlyPlayedNFTs]);
  
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

  // Add this near your other state variables
  const [permanentlyRemovedNFTs, setPermanentlyRemovedNFTs] = useState<Set<string>>(new Set());

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
          unsubscribeSearches = subscribeToRecentSearches(userFid, (searches) => {
            setRecentSearches(searches);
          });
        } catch (error) {
          logger.error('Error loading user data:', error);
        }
      }
    };

    loadUserData();

    return () => {
      if (unsubscribeSearches) {
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
    setRecentlyPlayedNFTs,
    recentlyAddedNFT 
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
            // Before setting, check if the first NFT is the same as our recently added one
            if (nfts.length > 0 && recentlyAddedNFT.current) {
              const firstNFTKey = `${nfts[0].contract}-${nfts[0].tokenId}`.toLowerCase();
              
              // If the first NFT is one we just added manually, skip this update
              if (firstNFTKey === recentlyAddedNFT.current) {
                demoLogger.debug('Skipping duplicate NFT update', firstNFTKey);
                return;
              }
            }
            
            setRecentlyPlayedNFTs(nfts);
          });
          return () => unsubscribe();
        }
      } catch (error) {
        logger.error('Error loading initial data:', error);
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
          
          // Log detailed checks for debugging media detection issues
          nftLogger.debug('Checking NFT for media:', {
            name: nft.name,
            audio: nft.audio,
            animation_url: nft.metadata?.animation_url,
            hasValidAudio: nft.hasValidAudio,
            isVideo: nft.isVideo
          });
          
          if (hasMedia) {
            nftLogger.debug('Found media NFT:', {
              name: nft.name,
              hasAudio,
              hasVideo,
              hasMediaInProperties,
              animation_url: nft.metadata?.animation_url
            });
          }
        } catch (error) {
          logger.error('Error checking media types:', error);
        }

        return hasMedia;
      });

      setFilteredNFTs(filtered);
      nftLogger.info(`Found ${filtered.length} media NFTs out of ${userNFTs.length} total NFTs`);
    };

    filterMediaNFTs();
  }, [userNFTs]);

  // Video synchronization is now handled by VideoSyncManager component

  useEffect(() => {
    if (isInitialPlay) {
      playerLogger.info('Minimizing player due to initial play');
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
      playerLogger.debug('Playing from Top Played section');
    }
    // Check if we're playing from featured section
    else if (FEATURED_NFTS.some((nft: NFT) => 
      getMediaKey(nft) === getMediaKey(currentPlayingNFT)
    )) {
      currentList = FEATURED_NFTS;
      playerLogger.debug('Playing from Featured section');
    }
    // Otherwise use the window.nftList for other views
    else if (window.nftList) {
      currentList = window.nftList;
      playerLogger.debug('Playing from main list');
    }
    
    if (!currentList.length) {
      playerLogger.debug('No NFTs in current list');
      return null;
    }

    // Find the current NFT in the list using mediaKey for consistent matching
    const currentMediaKey = getMediaKey(currentPlayingNFT);
    const currentIndex = currentList.findIndex(nft => getMediaKey(nft) === currentMediaKey);

    if (currentIndex === -1) {
      playerLogger.debug('Current NFT not found in list');
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
      logger.error('PiP error:', error);
    }
  };

  const handleLikeToggle = async (nft: NFT) => {
    // FOR TESTING: Use a default test FID if none is provided
    // This allows us to test liking functionality in demo mode
    const effectiveUserFid = userFid || 1234; // Use dummy FID for testing
    
    if (!effectiveUserFid || effectiveUserFid <= 0) {
      logger.error('❌ Cannot toggle like: Invalid userFid', effectiveUserFid);
      setError('Login required to like NFTs');
      return;
    }
    
    try {
      // Get the NFT key for tracking
      const nftKey = `${nft.contract?.toLowerCase()}-${nft.tokenId}`;
      const isCurrentlyLiked = isNFTLiked(nft, true);
      
      // In library view, we're ALWAYS unliking
      // In other views, check if the NFT is already liked
      const isUnliking = currentPage.isLibrary || isCurrentlyLiked;
      
      // If we're unliking (in library or the NFT is already liked)
      if (isUnliking) {
        // PERMANENT REMOVAL: Add this NFT to our permanent blacklist
        setPermanentlyRemovedNFTs(prev => {
          const updated = new Set(prev);
          updated.add(nftKey);
          return updated;
        });
        
        // IMMEDIATE UI UPDATE
        const filteredNFTs = likedNFTs.filter(item => {
          const itemKey = `${item.contract?.toLowerCase()}-${item.tokenId}`;
          return itemKey !== nftKey;
        });
        
        // Update state immediately
        setLikedNFTs(filteredNFTs);
        setIsLiked(false);
        
        // Show notification directly from here to ensure it appears
        if (libraryViewRef.current) {
          libraryViewRef.current.setState({
            showUnlikeNotification: true,
            unlikedNFTName: nft.name
          });
          
          // Auto-hide notification after 3 seconds
          setTimeout(() => {
            if (libraryViewRef.current) {
              libraryViewRef.current.setState({ showUnlikeNotification: false });
            }
          }, 3000);
        }
      }
      
      // THEN call Firebase (in background)
      let wasLiked = false;
      try {
        // Use the effective userFid (real or test value)
        wasLiked = await toggleLikeNFT(nft, effectiveUserFid);
      } catch (error) {
        logger.error('❌ Error in toggleLikeNFT:', error);
      }
      
      // For likes (not unlikes), we need to update the UI immediately to show the NFT as liked
      if (!isUnliking) {
        // Add the NFT to the liked list if it's not already there
        setLikedNFTs(prev => {
          // Check if the NFT is already in the list
          const nftExists = prev.some(item => {
            if (!item.contract || !item.tokenId) return false;
            const itemKey = `${item.contract.toLowerCase()}-${item.tokenId}`;
            return itemKey === nftKey;
          });
          
          // If it's already in the list, don't add it again
          if (nftExists) {
            return prev;
          }
          
          // Otherwise add it to the list
          return [...prev, nft];
        });
        
        // Update the isLiked state
        setIsLiked(true);
      }
      
      // For unlikes, we need to make sure the NFT stays removed
      // For likes, we need to make sure the NFT is added
      try {
        const freshLikedNFTs = await getLikedNFTs(effectiveUserFid);
        
        // CRITICAL: Apply our permanent removal list to filter out any NFTs
        // that should stay removed no matter what Firebase returns
        const filteredNFTs = freshLikedNFTs.filter(item => {
          if (!item.contract || !item.tokenId) return true;
          const itemKey = `${item.contract.toLowerCase()}-${item.tokenId}`;
          const isRemoved = permanentlyRemovedNFTs.has(itemKey);
          return !isRemoved;
        });
        
        // Ensure we don't have duplicates by using a Map with mediaKey as the primary key
        const uniqueNFTsMap = new Map();
        
        // If we're unliking, make sure the current NFT is not in the final list
        if (isUnliking) {
          const unlikingMediaKey = getMediaKey(nft);
          
          // Add all filtered NFTs except the one we're unliking (checking both mediaKey and contract-tokenId)
          filteredNFTs.forEach(item => {
            if (item.contract && item.tokenId) {
              const itemMediaKey = getMediaKey(item);
              const itemContractKey = `${item.contract.toLowerCase()}-${item.tokenId}`;
              
              // Skip if either the mediaKey or contract-tokenId matches the unliked NFT
              if ((unlikingMediaKey && itemMediaKey === unlikingMediaKey) || itemContractKey === nftKey) {
                return;
              }
              
              // Use mediaKey as the primary key if available, fallback to contract-tokenId
              const mapKey = itemMediaKey || itemContractKey;
              uniqueNFTsMap.set(mapKey, item);
            }
          });
        } else {
          // For likes, add all filtered NFTs using mediaKey as the primary key
          filteredNFTs.forEach(item => {
            if (item.contract && item.tokenId) {
              const itemMediaKey = getMediaKey(item);
              const itemContractKey = `${item.contract.toLowerCase()}-${item.tokenId}`;
              
              // Use mediaKey as the primary key if available, fallback to contract-tokenId
              const mapKey = itemMediaKey || itemContractKey;
              
              // If we already have this mediaKey, merge the NFT data to ensure we have the most complete information
              if (uniqueNFTsMap.has(mapKey)) {
                const existingNFT = uniqueNFTsMap.get(mapKey);
                const mergedNFT = {
                  ...existingNFT,
                  ...item,
                  // Ensure metadata is properly merged
                  metadata: {
                    ...(existingNFT.metadata || {}),
                    ...(item.metadata || {})
                  }
                };
                uniqueNFTsMap.set(mapKey, mergedNFT);
              } else {
                uniqueNFTsMap.set(mapKey, item);
              }
            }
          });
          
          // Make sure the NFT we just liked is in the list
          if (nft.contract && nft.tokenId) {
            const nftMediaKey = getMediaKey(nft);
            const mapKey = nftMediaKey || nftKey;
            
            // If we already have this mediaKey, merge the NFT data
            if (uniqueNFTsMap.has(mapKey)) {
              const existingNFT = uniqueNFTsMap.get(mapKey);
              const mergedNFT = {
                ...existingNFT,
                ...nft,
                // Ensure metadata is properly merged
                metadata: {
                  ...(existingNFT.metadata || {}),
                  ...(nft.metadata || {})
                }
              };
              uniqueNFTsMap.set(mapKey, mergedNFT);
            } else {
              uniqueNFTsMap.set(mapKey, nft);
            }
          }
        }
        
        // Convert Map back to array
        const uniqueNFTs = Array.from(uniqueNFTsMap.values());
        
        // Update the liked NFTs list
        setLikedNFTs(uniqueNFTs);
      } catch (error) {
        logger.error('❌ Error refreshing liked NFTs:', error);
      }
    } catch (error) {
      logger.error('❌ Error toggling like:', error);
      setError('Failed to update liked status');
    }
  };

  const isNFTLiked = (nft: NFT, ignoreCurrentPage: boolean = false): boolean => {
    if (!nft || !nft.contract || !nft.tokenId) {
      logger.debug('Invalid NFT passed to isNFTLiked, returning false');
      return false;
    }
    
    // If we're in library view and not ignoring current page, all NFTs are liked
    if (currentPage.isLibrary && !ignoreCurrentPage) {
      return true;
    }

    // Get the mediaKey for content-based tracking
    const nftMediaKey = getMediaKey(nft);
    
    if (nftMediaKey) {
      // First try to match by mediaKey (content-based approach)
      const mediaKeyMatch = likedNFTs.some(item => {
        const itemMediaKey = getMediaKey(item);
        return itemMediaKey === nftMediaKey;
      });
      
      if (mediaKeyMatch) {
        return true;
      }
    }
    
    // Fallback to contract-tokenId comparison if no mediaKey match found
    const nftKey = `${nft.contract}-${nft.tokenId}`.toLowerCase();
    
    const contractMatch = likedNFTs.some(item => {
      const itemKey = `${item.contract}-${item.tokenId}`.toLowerCase();
      return itemKey === nftKey;
    });
    
    return contractMatch;
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
    
    // Reset scroll position when changing pages
    window.scrollTo(0, 0);
    
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
      logger.error('Error searching users:', error);
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
    
    // Reset scroll position to top of page
    window.scrollTo(0, 0);
    
    setSelectedUser(null);
    setSearchResults([]);
    setUserNFTs([]);
    setError(null);
    
    // Reset NFT list to home view
    window.nftList = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
  };

  const handlePlayFromLibrary = async (nft: NFT) => {
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
    if (!isInitialPlay) {
      setIsPlayerMinimized(!isPlayerMinimized);
    }
  };

  const renderCurrentView = () => {
    // This key is important - it must change when the page changes
    const pageKey = Object.keys(currentPage).find(key => currentPage[key as keyof typeof currentPage] === true);
    
    // Return the AnimatePresence wrapper with the current view
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={pageKey}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={pageTransition}
          className="w-full h-full"
        >
          {currentPage.isHome && (
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
              likedNFTs={likedNFTs}            />
          )}
          {currentPage.isExplore && (
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

                  // Count by media type
                  const audioNFTs = nfts.filter(nft => nft.hasValidAudio).length;
                  const videoNFTs = nfts.filter(nft => nft.isVideo).length;
                  const bothTypes = nfts.filter(nft => nft.hasValidAudio && nft.isVideo).length;

                  const contractCounts: Record<string, number> = {};
                  nfts.forEach(nft => {
                    if (nft.contract) {
                      contractCounts[nft.contract] = (contractCounts[nft.contract] || 0) + 1;
                    }
                  });

                  // Cache the NFTs for future use
                  cacheNFTs(user.fid, nfts);

                  // Update state with fetched NFTs
                  setUserNFTs(nfts);
                } catch (error) {
                  logger.error('Error fetching user NFTs:', error);
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
              userNFTs={userNFTs}
              searchType={''}
              searchParam={''}
              likedNFTs={likedNFTs}
            />
          )}
          {currentPage.isLibrary && (
            <LibraryView
              ref={libraryViewRef}
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
              onLikeToggle={async (nft) => {
                if (currentPage.isLibrary) {
                  // Prevent re-liking from Library page
                  if (libraryViewRef.current) {
                    // Check if the NFT exists in likedNFTs array
                    const isCurrentlyLiked = likedNFTs.some(
                      likedNFT => likedNFT.contractAddress === nft.contractAddress && 
                                  likedNFT.tokenId === nft.tokenId
                    );

                    // Only allow unlike action (removing from library)
                    if (isCurrentlyLiked) {
                      libraryViewRef.current.setState({
                        showUnlikeNotification: true
                      });
                      await handleLikeToggle(nft);
                    }
                    // Ignore the click if it's trying to re-like
                  }
                } else {
                  await handleLikeToggle(nft);
                }
              }}
            />
          )}
          {currentPage.isProfile && (
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
              handlePlayAudio={handlePlayFromLibrary}
              isPlaying={isPlaying}
              currentlyPlaying={currentlyPlaying}
              handlePlayPause={handlePlayPause}
              onReset={handleReset}
              onNFTsLoaded={setUserNFTs}
              onLikeToggle={handleLikeToggle}
            />
          )}
        </motion.div>
      </AnimatePresence>
    );
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
        const nftKey = `${data.nftContract}-${data.tokenId}`.toLowerCase();
        
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
      logger.error('Error fetching recently played:', error);
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
            const nftKey = `${data.nftContract}-${data.tokenId}`.toLowerCase();
            
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
          logger.error('Error with fallback query:', fallbackError);
        }
      }
    }
  }, [userFid]);

  useEffect(() => {
    fetchRecentlyPlayed();
  }, [fetchRecentlyPlayed]);

  const prepareAndPlayAudio = async (nft: NFT) => {
    // Set the current queue based on the active view
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
    }
    
    // Update the global nftList for next/previous navigation
    window.nftList = currentQueue;
    
    try {
      // Call the original handlePlayAudio from useAudioPlayer
      await handlePlayAudio(nft);
    } catch (error) {
      logger.error('Error playing audio:', error);
    }
  };

  const handlePlayNext = async () => {
    if (!currentPlayingNFT) return;
    
    // Get the appropriate queue based on current page
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
    }
    
    // Find current NFT index in the queue
    const currentIndex = currentQueue.findIndex(
      nft => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );
    
    if (currentIndex === -1 || currentQueue.length === 0) {
      return;
    }
    
    // Get next NFT with wraparound
    const nextIndex = (currentIndex + 1) % currentQueue.length;
    const nextNFT = currentQueue[nextIndex];
    
    // Play the next NFT
    await prepareAndPlayAudio(nextNFT);
  };

  const handlePlayPrevious = async () => {
    if (!currentPlayingNFT) return;
    
    // Get the appropriate queue based on current page
    let currentQueue: NFT[] = [];
    
    if (currentPage.isExplore) {
      currentQueue = filteredNFTs;
    } else if (currentPage.isLibrary) {
      currentQueue = likedNFTs;
    } else if (currentPage.isProfile) {
      currentQueue = userNFTs;
    } else if (currentPage.isHome) {
      currentQueue = [...recentlyPlayedNFTs, ...topPlayedNFTs.map(item => item.nft)];
    }
    
    // Find current NFT index in the queue
    const currentIndex = currentQueue.findIndex(
      nft => nft.contract === currentPlayingNFT.contract && nft.tokenId === currentPlayingNFT.tokenId
    );
    
    if (currentIndex === -1 || currentQueue.length === 0) {
      return;
    }
    
    // Get previous NFT with wraparound
    const prevIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    const prevNFT = currentQueue[prevIndex];
    
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
    
    // Find only the specific video element we need
    const targetVideoId = `video-${nft.contract}-${nft.tokenId}`;
    const targetVideo = document.getElementById(targetVideoId) as HTMLVideoElement;
    
    // Only manage the target video to avoid affecting other elements
    if (targetVideo) {
      // Ensure video has playsinline attribute for mobile
      targetVideo.setAttribute('playsinline', 'true');
      
      // For the target video, try to play it directly
      try {
        // First try unmuted
        targetVideo.muted = false;
        targetVideo.play().catch(() => {
          // If that fails (expected on mobile), fall back to muted
          targetVideo.muted = true;
          targetVideo.play().catch(() => {
          });
        });
      } catch (e) {
      }
    }
    
    // Pause other videos more carefully to avoid affecting scrolling
    try {
      // Get only videos that aren't our target
      const otherVideos = document.querySelectorAll(`video:not(#${targetVideoId})`);
      otherVideos.forEach(video => {
        if (!(video as HTMLVideoElement).paused) {
          (video as HTMLVideoElement).pause();
        }
      });
    } catch (e) {
    }
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
    // Use a try-catch to prevent any errors from breaking the app
    try {
      videoPerformanceMonitor.init();
    } catch (e) {
      logger.error('Error initializing video performance monitor:', e);
    }
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
    // Set search results to empty array
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
      
      // Count by media type (for debugging only, not displayed)
      const audioNFTs = nfts.filter(nft => nft.hasValidAudio).length;
      const videoNFTs = nfts.filter(nft => nft.isVideo).length;
      const bothTypes = nfts.filter(nft => nft.hasValidAudio && nft.isVideo).length; 
      
      const contractCounts: Record<string, number> = {};
      nfts.forEach(nft => {
        if (nft.contract) {
          contractCounts[nft.contract] = (contractCounts[nft.contract] || 0) + 1;
        }
      });
      
      setUserNFTs(nfts);
      setFilteredNFTs(nfts);
      
      // Update global NFT list for player
      window.nftList = nfts;
      
      setError(null);
    } catch (error) {
      logger.error('Error loading user NFTs:', error);
      setError('Error loading NFTs');
    } finally {
      setIsLoading(false);
    }
  };

  // Add this near the top of the Demo component
  const libraryViewRef = useRef<LibraryView>(null);

  // Find where you initially load the liked NFTs
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userFid) {
        const liked = await getLikedNFTs(userFid);
        
        // CRITICAL: Apply our permanent blacklist
        const filteredLiked = liked.filter(item => {
          if (!item.contract || !item.tokenId) return true;
          const itemKey = `${item.contract.toLowerCase()}-${item.tokenId}`;
          return !permanentlyRemovedNFTs.has(itemKey);
        });
        
        setLikedNFTs(filteredLiked);
      }
    };
    
    loadLikedNFTs();
  }, [userFid, permanentlyRemovedNFTs]); // Add permanentlyRemovedNFTs as a dependency

  // Add this effect to monitor for problematic NFTs
  const checkProblematicNFTs = useCallback(() => {
    // Skip this check during video playback on cellular
    if (shouldDelayOperation()) {
      return;
    }
    
    // Original code...
  }, [userNFTs]);

  useEffect(() => {
    // Run check on startup and when NFT collections change
    checkProblematicNFTs();
    
    // Log cleanup when component unmounts
    return () => {
      demoLogger.debug('Cleaning up subscriptions');
    };
  }, [checkProblematicNFTs]);

  return (
    <div className="min-h-screen flex flex-col no-select">
      {/* Persistent header with logo that navigates to home page */}
      <NotificationHeader
        show={false} // Keeps the header in a state where it just shows the logo
        message=""
        onLogoClick={() => switchPage('isHome')}
        type="info"
      />
      
      {/* Global NFT Notification component */}
      <NFTNotification onReset={() => switchPage('isHome')} />
      
      {/* Hidden debug control - only visible when double-clicking logo */}
      <div className="hidden">
        <button
          onClick={() => {
            // Toggle between logging enabled/disabled
            const isCurrentlyEnabled = logger.isDebugMode();
            if (isCurrentlyEnabled) {
              logger.disableAllLogs();
              alert('All logs disabled. Reload page for changes to fully take effect.');
            } else {
              // Use type assertion to handle _originalConsole property
              const customWindow = window as any;
              if (customWindow._originalConsole) {
                // Restore original console methods if they were saved
                Object.keys(customWindow._originalConsole).forEach(key => {
                  // @ts-ignore - dynamic property access
                  console[key] = customWindow._originalConsole[key];
                });
              }
              logger.setDebugMode(true);
              alert('Logs enabled');
            }
          }}
          id="hidden-debug-toggle"
          className="hidden"
        >
          Toggle Logs
        </button>
      </div>

      
      {userFid && (
        <UserDataLoader
          userFid={userFid}
          onUserDataLoaded={setUserData}
          onNFTsLoaded={setUserNFTs}
          onLikedNFTsLoaded={setLikedNFTs}
          onError={setError}
        />
      )}
      <div className="flex-1 container mx-auto px-4 py-6 pb-40"> {/* Removed mt-16 to restore original positioning */}
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
          onLikeToggle={(nft) => {
            // If we're in the library view, we need to handle the unlike notification
            if (currentPage.isLibrary && libraryViewRef.current) {
              libraryViewRef.current.handleUnlike(nft);
            } else {
              handleLikeToggle(nft);
            }
          }}
          isLiked={isNFTLiked(currentPlayingNFT, true)}
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

      {/* Use our new unified NFTNotification component */}
      <NFTNotification onReset={() => switchPage('isHome')} />
    </div>
  );
};

export default Demo;
//