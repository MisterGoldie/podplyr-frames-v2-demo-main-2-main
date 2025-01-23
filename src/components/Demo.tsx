"use client";

import Image from 'next/image';
import { useEffect, useCallback, useState, useMemo, useRef, ReactEventHandler, SyntheticEvent } from "react";
import AudioVisualizer from './AudioVisualizer';
import { debounce } from 'lodash';
import { trackUserSearch, getRecentSearches, SearchedUser, getTopPlayedNFTs, fetchNFTDetails, trackNFTPlay, toggleLikeNFT, getLikedNFTs, removeLikedNFT, addLikedNFT } from '../lib/firebase';
import sdk, { type FrameContext } from "@farcaster/frame-sdk";
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';


interface FarcasterUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  follower_count: number;
  following_count: number;
  profile?: {
    bio?: {
      text?: string;
    } | string;
  };
  verifiedAddresses?: string[];
}

interface _UserDetails {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  follower_count: number;
  following_count: number;
  verified_addresses: string[];
}

interface SearchBarProps {
  onSearch: (username: string) => void;
  isSearching: boolean;
}

// Rename unused type with underscore prefix
type _SearchResults = {
  users: FarcasterUser[];
  next?: {
    cursor?: string;
  };
};

function SearchBar({ onSearch, isSearching }: SearchBarProps) {
  const [username, setUsername] = useState('');
  const [suggestions, setSuggestions] = useState<FarcasterUser[]>([]);
  const [_isLoadingSuggestions] = useState(false);

  // Keep the existing suggestions functionality
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (username.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
        if (!neynarKey) return;

        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(username)}`,
          {
            headers: {
              'accept': 'application/json',
              'api_key': neynarKey
            }
          }
        );

        const data = await response.json();
        if (data.result?.users) {
          const mappedSuggestions = data.result.users.map((user: FarcasterUser) => ({
            fid: user.fid,
            username: user.username,
            display_name: user.display_name || user.username,
            pfp_url: user.pfp_url || 'https://avatar.vercel.sh/' + user.username,
            follower_count: user.follower_count || 0,
            following_count: user.following_count || 0
          })).slice(0, 3);
          setSuggestions(mappedSuggestions);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSearch(username.trim());
      setSuggestions([]); // Clear suggestions after search
    }
  };

  const handleSuggestionClick = (selectedUsername: string) => {
    setUsername(''); // Clear the input field
    onSearch(selectedUsername);
    setSuggestions([]); // Clear suggestions after selection
  };

  return (
    <div className="w-full max-w-[90vw] mx-auto text-center">
      {/* Animated Logo */}
      <div className="relative p-4 rounded-xl bg-gray-900/40 backdrop-blur-sm border border-green-400/20">
        <h1 className="text-4xl sm:text-6xl font-mono text-green-400 tracking-widest">
          PODPLAYR
        </h1>
        {/* Audio Wave Animation */}
        <div className="mt-2 flex justify-center items-end space-x-1 h-3">
          {[1,2,3,4].map((i) => (
            <div 
              key={i}
              className="w-[2px] bg-green-400 rounded-full transition-all duration-150"
              style={{
                height: `${2 + (i * 3)}px`,
                animation: `audioWavePulse 1.5s ease-in-out infinite`,
                animationDelay: `${(4-i) * 0.2}s`,
                transformOrigin: 'bottom'
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative mt-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter Farcaster username.."
          className="w-full px-4 py-3 bg-transparent border-2 border-green-400/30 
                   rounded-full text-green-400 placeholder-green-400/50 
                   focus:outline-none focus:border-green-400 
                   transition-all duration-300 font-mono text-base"
          disabled={isSearching}
        />
      </div>

      {/* Keep existing suggestions dropdown with adjusted positioning */}
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 mx-4 bg-gray-900/90 backdrop-blur-sm rounded-lg border border-green-400/30 max-h-60 overflow-y-auto z-10">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.fid}
              onClick={() => handleSuggestionClick(suggestion.username)}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-green-400/10 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative">
                <Image
                  src={suggestion.pfp_url || `https://avatar.vercel.sh/${suggestion.username}`}
                  alt={suggestion.display_name || suggestion.username || 'User avatar'}
                  className="object-cover"
                  fill
                  sizes="40px"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://avatar.vercel.sh/${suggestion.username}`;
                  }}
                />
              </div>
              <div>
                <div className="font-medium text-green-400">{suggestion.display_name || suggestion.username}</div>
                <div className="text-sm text-gray-400">@{suggestion.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function _isNFTArtwork(artwork: string | NFTArtwork): artwork is NFTArtwork {
  return typeof artwork === 'object' && artwork !== null && ('uri' in artwork || 'url' in artwork);
}

interface NFTArtwork {
  uri?: string;
  url?: string;
  mimeType?: string;
}

type _NFTArtworkType = string | NFTArtwork;

interface ArtworkObject {
  uri?: string;
  url?: string;
  mimeType?: string;
}

function isArtworkObject(artwork: unknown): artwork is ArtworkObject {
  if (typeof artwork !== 'object' || artwork === null) return false;
  const obj = artwork as { [key: string]: unknown };
  return (
    ('uri' in obj && (typeof obj['uri'] === 'string' || obj['uri'] === undefined)) ||
    ('url' in obj && (typeof obj['url'] === 'string' || obj['url'] === undefined))
  );
}

function _getArtworkUrl(artwork: unknown): string | null {
  if (typeof artwork === 'string') {
    return artwork;
  }
  if (isArtworkObject(artwork)) {
    const obj = artwork as { [key: string]: string | undefined };
    const uri = 'uri' in obj ? obj['uri'] : undefined;
    const url = 'url' in obj ? obj['url'] : undefined;
    return uri || url || null;
  }
  return null;
}

interface NFTMetadata {
    name?: string;
    image?: string;
    image_url?: string;
    animation_url?: string;
    audio?: string;
    audio_url?: string;
    mimeType?: string;
    mime_type?: string;
    artwork?: unknown;
    content?: {
      mime?: string;
    };
    animation_details?: {
      format?: string;
      codecs?: string[];
      bytes?: number;
      duration?: number;
      width?: number;
      height?: number;
    };
    properties?: {
      image?: string;
      audio?: string;
      audio_url?: string;
      audio_file?: string;
      audio_mime_type?: string;
      animation_url?: string;
      video?: string;
      mimeType?: string;
      files?: NFTFile[] | NFTFile;
      category?: string;
      sound?: boolean;
      visual?: {
        url?: string;
      };
      soundContent?: {
        url?: string;
        mimeType?: string;
      };
    };
}

interface NFTFile {
  uri?: string;
  url?: string;
  type?: string;
  mimeType?: string;
  name?: string;
}

interface NFTMedia {
  gateway?: string;
  raw?: string;
  format?: string;
  bytes?: number;
}

export interface NFT {
  contract: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  animationUrl?: string;
  audio?: string;
  hasValidAudio?: boolean;
  isVideo?: boolean;
  isAnimation?: boolean;
  collection?: {
    name: string;
    image?: string;
  };
  metadata?: NFTMetadata;
  network?: 'ethereum' | 'base';
}

interface _AlchemyNFT {
  contract: {
    address: string;
    name?: string;
    openSea?: {
      imageUrl?: string;
    };
  };
  tokenId: string;
  title?: string;
  description?: string;
  metadata?: NFTMetadata;
  media?: NFTMedia[];
}

interface SearchResultProps {
  user: FarcasterUser;
  onSelect: (user: FarcasterUser) => void;
}

function SearchResults({ user, onSelect }: SearchResultProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg cursor-pointer hover:bg-gray-50" onClick={() => onSelect(user)}>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 relative">
          <Image
            src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
            alt={user.display_name || user.username}
            className="object-cover"
            fill
            sizes="64px"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = `https://avatar.vercel.sh/${user.username}`;
            }}
          />
        </div>
        <div>
          <h3 className="font-mono text-green-400 truncate max-w-[200px]">
            {user.display_name || user.username}
          </h3>
          <p className="font-mono text-gray-400 truncate max-w-[200px]">@{user.username}</p>
        </div>
      </div>
    </div>
  );
}

const retroStyles = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .retro-container {
    border: 2px solid #444;
    box-shadow: 
      inset 0 0 20px rgba(0,0,0,0.5),
      0 2px 8px rgba(0,0,0,0.3);
    transition: all 0.3s ease-in-out;
  }

  /* Remove default border radius when used as player */
  .retro-container:not([class*='rounded-t-']) {
    border-radius: 10px;
  }

  /* Special styling for player container */
  .retro-container[class*='rounded-t-'] {
    border-bottom: none;
    border-left: none;
    border-right: none;
    border-top: 1px solid #444;
  }

  .retro-container.playing {
    border-color: #22c55e40;
    box-shadow: 
      inset 0 0 20px rgba(34,197,94,0.1),
      0 2px 8px rgba(34,197,94,0.1);
  }

  .retro-button {
    background: linear-gradient(45deg, #333, #222);
    border: 2px solid #444;
    border-radius: 50%;
    box-shadow: 
      inset 0 0 10px rgba(255,255,255,0.1),
      0 2px 4px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  }

  .retro-button:hover {
    transform: scale(1.05);
    box-shadow: 
      inset 0 0 15px rgba(255,255,255,0.2),
      0 4px 8px rgba(0,0,0,0.3);
  }

  .retro-button:active {
    transform: scale(0.95);
  }

  .retro-display {
    background: #000;
    border: 2px solid #444;
    border-radius: 5px;
    box-shadow: 
      inset 0 0 10px rgba(0,255,0,0.2),
      0 2px 4px rgba(0,0,0,0.2);
    font-family: "VT323", monospace;
    color: #0f0;
    text-shadow: 0 0 5px rgba(0,255,0,0.5);
  }

  .retro-progress {
    height: 4px;
    background: #333;
    border-radius: 2px;
    overflow: hidden;
    cursor: pointer;
  }

  .retro-progress::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: #0f0;
    border: 2px solid #0f0;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(0,255,0,0.5);
    cursor: pointer;
    margin-top: -4px;
  }

  .retro-progress::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #0f0;
    border: 2px solid #0f0;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(0,255,0,0.5);
    cursor: pointer;
  }

  .retro-progress::-webkit-slider-runnable-track {
    height: 4px;
    background: #333;
    border-radius: 2px;
  }

  .retro-progress::-moz-range-track {
    height: 4px;
    background: #333;
    border-radius: 2px;
  }

  .led-light {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f00;
    box-shadow: 0 0 10px #f00;
    animation: blink 1s infinite;
  }

  .led-light.on {
    background: #0f0;
    box-shadow: 0 0 10px #0f0;
  }

  .cassette-wheel {
    width: 40px;
    height: 40px;
    border: 2px solid #444;
    border-radius: 50%;
    background: linear-gradient(45deg, #222, #333);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cassette-wheel::before {
    content: '';
    position: absolute;
    width: 15px;
    height: 15px;
    background: #0f0;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(0,255,0,0.3);
    opacity: 0.5;
  }

  .cassette-wheel::after {
    content: '';
    position: absolute;
    width: 25px;
    height: 25px;
    border: 2px solid #444;
    border-radius: 50%;
  }

  .retro-button svg {
    transition: opacity 0.2s ease;
  }
`;

const RetroStyles = () => (
  <style jsx global>
    {retroStyles}
  </style>
);

// Move utility functions before MediaRenderer component
const isMediaUrl = (url: string): { isVideo: boolean; isAnimation: boolean } => {
  if (!url) return { isVideo: false, isAnimation: false };
  
  const lowercaseUrl = url.toLowerCase();
  const isVideo = lowercaseUrl.match(/\.(mp4|mov|webm)$/i) !== null;
  const isAnimation = lowercaseUrl.match(/\.(gif|webp)$/i) !== null;
  
  return { isVideo, isAnimation };
};

const IPFS_GATEWAYS = [
  'https://nftstorage.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://w3s.link/ipfs/',
  'https://4everland.io/ipfs/',
  'https://gateway.ipfs.io/ipfs/'
];

const processMediaUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  
  // Clean the URL first
  const cleanUrl = url.trim();
  
  // Handle IPFS URLs
  if (cleanUrl.startsWith('ipfs://')) {
    const ipfsHash = cleanUrl.replace('ipfs://', '');
    // Try the first gateway by default
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }
  
  // Handle HTTP URLs that contain IPFS hashes
  if (cleanUrl.includes('/ipfs/')) {
    const ipfsHash = cleanUrl.split('/ipfs/')[1];
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }
  
  // Return original URL if it's already HTTP/HTTPS
  if (cleanUrl.startsWith('http')) {
    return cleanUrl;
  }
  
  return undefined;
};

// Update the MediaRenderer component props interface and implementation
interface MediaRendererProps {
  url: string;
  alt: string;
  className: string;
}

// Add type declaration for model-viewers
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src: string;
          'auto-rotate'?: boolean;
          'camera-controls'?: boolean;
          ar?: boolean;
          className?: string;
          onError?: ReactEventHandler<HTMLElement>;
          onLoad?: () => void;
        },
        HTMLElement
      >;
    }
  }
}

const MediaRenderer = ({ url, alt, className }: MediaRendererProps) => {
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const mediaUrl = useMemo(() => {
    if (!url) return null;
    if (url.includes('/ipfs/')) {
      const hash = url.split('/ipfs/')[1];
      return `${IPFS_GATEWAYS[currentGatewayIndex]}${hash}`;
    }
    return url;
  }, [url, currentGatewayIndex]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = e.currentTarget;
    console.log('Video load error:', {
      url: mediaUrl,
      error: videoElement.error,
      networkState: videoElement.networkState,
      readyState: videoElement.readyState,
      currentGateway: IPFS_GATEWAYS[currentGatewayIndex]
    });

    if (currentGatewayIndex < IPFS_GATEWAYS.length - 1) {
      setCurrentGatewayIndex(prev => prev + 1);
    } else {
      setError(true);
    }
  };

  if (!mediaUrl || error) {
    return (
      <div className={`${className} bg-gray-800 flex items-center justify-center`}>
        <div className="text-green-400 font-mono text-sm break-all p-2">{alt}</div>
      </div>
    );
  }

  const isVideo = /\.(mp4|webm|mov)$/i.test(mediaUrl);

  if (isVideo) {
    return (
      <video 
        ref={videoRef}
        src={mediaUrl}
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        loop={false}
        muted={true}
        controls={false}
        preload="none"
        poster={url ? processMediaUrl(url.replace(/\.(mp4|webm|mov)/, '.jpg')) : undefined}
        onError={handleVideoError}
        onLoadedData={() => setLoaded(true)}
      />
    );
  }

  return (
    <img 
      src={mediaUrl} 
      alt={alt} 
      className={className}
      onError={() => setError(true)}
    />
  );
};

// Add near other interfaces at the top
interface NFTImageProps {
  src: string;  // This requires a string, but we're passing potentially undefined values
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

const NFTImage = ({ src, alt, className, width, height }: NFTImageProps) => {
  const fallbackSrc = '/placeholder.jpg';
  return (
    <Image
      src={src || fallbackSrc}
      alt={alt}
      className={className}
      width={width || 500}
      height={height || 500}
    />
  );
};

// Add near the top with other interfaces
interface ExtendedFrameContext extends Omit<FrameContext, 'user'> {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
}

export default function Demo({ title }: { title?: string }) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [userContext, setUserContext] = useState<ExtendedFrameContext>();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileView, setIsProfileView] = useState(false);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedUser, setSelectedUser] = useState<FarcasterUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FarcasterUser[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [currentPlayingNFT, setCurrentPlayingNFT] = useState<NFT | null>(null);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(true);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearchPage, setIsSearchPage] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMobile] = useState(() => window.innerWidth < 768);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [mediaLoadProgress, setMediaLoadProgress] = useState(0);
  const [preloadedMedia, setPreloadedMedia] = useState<Set<string>>(new Set());
  const [isLoaded, setLoaded] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [lastKnownPosition, setLastKnownPosition] = useState(0);
  const [realPlaybackPosition, setRealPlaybackPosition] = useState(0);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [isExpandButtonVisible, setIsExpandButtonVisible] = useState(false);
  // Add this state for recent searches
  const [recentSearches, setRecentSearches] = useState<SearchedUser[]>([]);
  const [loadedAudioElements, setLoadedAudioElements] = useState<{[key: string]: boolean}>({});
  const [isExpandVisible, setIsExpandVisible] = useState(false);
  const expandTimeoutRef = useRef<NodeJS.Timeout>();
  // Add new state for top played NFTs
  const [topPlayedNFTs, setTopPlayedNFTs] = useState<{ nft: NFT; count: number }[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>([]);
  // Add this state
  const [showLikedNFTs, setShowLikedNFTs] = useState(false);
  
  // Add near other state declarations (around line 661)
  const NFT_CACHE_KEY = 'nft-cache-';
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  const getCachedNFTs = (userId: number) => {
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

  // Only show NFTs with audio
  const filteredNfts = nfts.filter(nft => nft.hasValidAudio);

  const handleStopPlaying = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentPlayingNFT(null);
    setCurrentlyPlaying(null);
  };

  const handleSeek = (time: number) => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    const pipVideo = document.pictureInPictureElement as HTMLVideoElement;
    
    if (audio) {
      audio.currentTime = time;
    }
    if (video) {
      video.currentTime = time;
    }
    if (pipVideo && pipVideo !== video) {
      pipVideo.currentTime = time;
    }
    
    setAudioProgress(time);
  };

  const handleSeekOffset = (offset: number) => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    const pipVideo = document.pictureInPictureElement as HTMLVideoElement;
    
    if (!audio && !video) return;
    
    const currentTime = audio?.currentTime || video?.currentTime || 0;
    const duration = audio?.duration || video?.duration || 0;
    const newTime = Math.max(0, Math.min(duration, currentTime + offset));
    
    // Use handleSeek to ensure consistent behavior
    handleSeek(newTime);
  };

  const debouncedHandleSeek = useCallback(
    debounce((value: number) => {
      handleSeek(value);
    }, 100),
    []
  );

  // Add SDK initialization
  useEffect(() => {
    const load = async () => {
      try {
        console.log('Loading SDK context...');
        const context = await sdk.context;
        console.log('SDK Context loaded:', context);
        setUserContext(context as ExtendedFrameContext);
        setIsSDKLoaded(true);
        sdk.actions.ready();
      } catch (error) {
        console.error('SDK Context error:', error);
      }
    };

    if (!isSDKLoaded) {
      load();
    }
  }, [isSDKLoaded]);

  useEffect(() => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    if (!audio && !video) return;

    const updateProgress = () => {
      if (audio) {
        setAudioProgress(audio.currentTime);
      } else if (video) {
        setAudioProgress(video.currentTime);
      }
    };

    const updateDuration = () => {
      if (audio) {
        setAudioDurations(prev => ({
          ...prev,
          [`${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`]: audio.duration
        }));
      } else if (video) {
        setAudioDurations(prev => ({
          ...prev,
          [`${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`]: video.duration
        }));
      }
    };

    const handleEnded = () => {
      setCurrentlyPlaying(null);
      setAudioProgress(0);
      setIsPlaying(false);
    };

    // Add handlers for video play/pause in PiP
    const handleVideoPlay = async () => {
      if (!isPlaying) {
        setIsPlaying(true);
        if (audio) {
          audio.currentTime = video?.currentTime || 0;
          await audio.play();
        }
      }
    };

    const handleVideoPause = () => {
      if (isPlaying) {
        setIsPlaying(false);
        if (audio) {
          audio.pause();
        }
      }
    };

    // Add seeking event handlers for PiP
    const handleVideoSeeking = () => {
      if (video && audio) {
        audio.currentTime = video.currentTime;
        setAudioProgress(video.currentTime);
      }
    };

    const handleVideoSeeked = () => {
      if (video && audio) {
        audio.currentTime = video.currentTime;
        setAudioProgress(video.currentTime);
      }
    };

    if (audio) {
      audio.addEventListener('timeupdate', updateProgress);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('ended', handleEnded);
    }

    if (video) {
      video.addEventListener('timeupdate', updateProgress);
      video.addEventListener('loadedmetadata', updateDuration);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('play', handleVideoPlay);
      video.addEventListener('pause', handleVideoPause);
      video.addEventListener('seeking', handleVideoSeeking);
      video.addEventListener('seeked', handleVideoSeeked);
    }

    return () => {
      if (audio) {
        audio.removeEventListener('timeupdate', updateProgress);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('ended', handleEnded);
      }
      if (video) {
        video.removeEventListener('timeupdate', updateProgress);
        video.removeEventListener('loadedmetadata', updateDuration);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('play', handleVideoPlay);
        video.removeEventListener('pause', handleVideoPause);
        video.removeEventListener('seeking', handleVideoSeeking);
        video.removeEventListener('seeked', handleVideoSeeked);
      }
    };
  }, [currentPlayingNFT, isPlaying]);

  const playMedia = async (audio: HTMLAudioElement, video: HTMLVideoElement | null, nft: NFT) => {
    try {
      const nftId = `${nft.contract}-${nft.tokenId}`;
      
      // Only load video if it's not already loaded with the correct source
      if (video && nft.metadata?.animation_url && 
          (!video.src || !video.src.includes(nft.metadata.animation_url))) {
        video.src = processMediaUrl(nft.metadata.animation_url) || '';
        video.load();
        
        await new Promise((resolve) => {
          video.oncanplay = resolve;
        });
      }

      // Sync video with audio time
      if (video) {
        video.currentTime = audio.currentTime;
        if (!video.paused && isPlaying) {
          await video.play();
        }
      }

      // Handle audio playback
      if (audio.paused) {
        await audio.play();
      }
      setIsPlaying(true);
      setIsMediaLoading(false);
    } catch (error) {
      console.warn('Media playback failed:', error);
      setIsMediaLoading(false);
      throw error;
    }
  };

  const handlePlayAudio = async (nft: NFT) => {
    try {
      const nftId = `${nft.contract}-${nft.tokenId}`;
      
      // Stop any currently playing audio first
      if (currentPlayingNFT) {
        const currentAudio = document.getElementById(
          `audio-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`
        ) as HTMLAudioElement;
        
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }
      }

      // Clear previous audio source and reload
      const audio = document.getElementById(`audio-${nftId}`) as HTMLAudioElement;
      if (audio) {
        audio.src = processMediaUrl(nft.audio || nft.metadata?.animation_url || '') || '';
        audio.load();
      }

      // Set new NFT as current
      setCurrentlyPlaying(nftId);
      setCurrentPlayingNFT(nft);
      setIsPlayerVisible(true);
      setIsPlayerMinimized(false);
      
      // Track the play after successfully starting playback
      if (audio && nft.hasValidAudio) {
        await playMedia(audio, videoRef.current, nft);
        // Get FID from user context
        if (userContext?.user?.fid) {
          await trackNFTPlay(nft, userContext.user.fid);
        }
      }

    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      setError('Failed to play media');
    }
  };

  const handleSearch = async (username: string) => {
    setIsSearching(true);
    setError(null);
    setSearchResults([]);
    setSelectedUser(null);
    setNfts([]);

    try {
      // Sanitize the username input
      const sanitizedUsername = encodeURIComponent(username.trim().toLowerCase());
      
      if (!sanitizedUsername) {
        throw new Error('Please enter a valid username');
      }

      const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      if (!neynarKey) {
        throw new Error('API key not configured');
      }

      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/search?q=${sanitizedUsername}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }

      const data = await response.json();
      
      if (data.result?.users) {
        setSearchResults(data.result.users);
      } else {
        setSearchResults([]);
        setError('No users found');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'Failed to search');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Create the debounced version of handleSearch
  const debouncedSearch = useCallback(
    debounce((username: string) => {
      handleSearch(username);
    }, 300),
    [] // Empty dependency array since handleSearch is defined in the component
  );

  const fetchNFTsForAddress = async (address: string, alchemyKey: string) => {
    try {
      const allNFTs: NFT[] = [];
      
      // Configure options for the fetch request
      const options = {
        method: 'GET',
        headers: {
          'accept': 'application/json'
        }
      };

      // Construct mainnet URL with v2 endpoint
      const mainnetUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`;
      
      console.log('[NFT Fetch] Attempting mainnet fetch:', mainnetUrl.replace(alchemyKey, 'HIDDEN_KEY'));

      const response = await fetch(mainnetUrl, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.ownedNfts?.length) {
        const processedNFTs = data.ownedNfts
          .map((nft: any) => {
            try {
              return processNFTMetadata(nft);
            } catch (error) {
              console.warn('[NFT Fetch] Metadata processing error:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                nftContract: nft?.contract?.address,
                nftId: nft?.tokenId
              });
              return null;
            }
          })
          .filter((nft: NFT | null) => nft && nft.hasValidAudio);

        allNFTs.push(...processedNFTs);
      }

      // Try Base network with same format
      try {
        const baseUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`;
        
        const baseResponse = await fetch(baseUrl, options);
        
        if (baseResponse.ok) {
          const baseData = await baseResponse.json();
          if (baseData.ownedNfts?.length) {
            const processedNFTs = baseData.ownedNfts
              .map((nft: any) => {
                try {
                  return processNFTMetadata(nft);
                } catch (error) {
                  console.warn('[NFT Fetch] Base metadata error:', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    nftContract: nft?.contract?.address,
                    nftId: nft?.tokenId
                  });
                  return null;
                }
              })
              .filter((nft: NFT | null) => nft && nft.hasValidAudio);

            allNFTs.push(...processedNFTs);
          }
        }
      } catch (error) {
        console.warn('[NFT Fetch] Base network error:', error);
      }

      return allNFTs;
    } catch (error) {
      console.error('[NFT Fetch] Error:', error);
      throw error;
    }
  };

  // Update handleUserSelect with better error handling
  const handleUserSelect = async (user: FarcasterUser) => {
    try {
      await trackUserSearch(user);
      setIsSearchPage(false);
      console.log('=== START NFT FETCH ===');
      setIsLoadingNFTs(true);
      setError(null);
      setNfts([]);

      // Check API Keys
      const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      console.log('API Keys present:', {
        hasNeynarKey: !!neynarKey,
        hasAlchemyKey: !!alchemyKey
      });

      if (!neynarKey || !alchemyKey) {
        throw new Error('Missing API keys - check your environment variables');
      }

      // Log the user data we're working with
      console.log('Processing user:', {
        fid: user.fid,
        username: user.username
      });

      // Fetch user profile from Neynar
      const profileResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${user.fid}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey
          }
        }
      );

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error('Profile fetch failed:', {
          status: profileResponse.status,
          statusText: profileResponse.statusText,
          error: errorText
        });
        throw new Error(`Failed to fetch user profile: ${errorText}`);
      }

      const profileData = await profileResponse.json();
      console.log('Profile data received:', profileData);

      let allAddresses: string[] = [];

      // Get verified addresses
      if (profileData.users?.[0]?.verifications) {
        allAddresses = [...profileData.users[0].verifications];
        console.log('Verified addresses found:', allAddresses);
      }

      // Get custody address
      if (profileData.users?.[0]?.custody_address) {
        allAddresses.push(profileData.users[0].custody_address);
        console.log('Added custody address:', profileData.users[0].custody_address);
      }

      // Filter addresses
      allAddresses = [...new Set(allAddresses)].filter(addr => 
        addr && addr.startsWith('0x') && addr.length === 42
      );

      console.log('Final addresses to check:', allAddresses);

      if (allAddresses.length === 0) {
        throw new Error('No valid addresses found for this user');
      }

      setSelectedUser({
        ...user,
        verifiedAddresses: allAddresses
      });

      // Process addresses in smaller batches
      const batchSize = 3;
      const allNFTs: NFT[] = [];

      for (let i = 0; i < allAddresses.length; i += batchSize) {
        const addressBatch = allAddresses.slice(i, i + batchSize);
        console.log(`Processing batch ${i/batchSize + 1}:`, addressBatch);
        
        try {
          const batchResults = await Promise.all(
            addressBatch.map(address => fetchNFTsForAddress(address, alchemyKey))
          );
          
          console.log(`Batch ${i/batchSize + 1} results:`, {
            totalNFTs: batchResults.flat().length,
            addressesProcessed: addressBatch
          });
          
          allNFTs.push(...batchResults.flat());
        } catch (batchError) {
          console.error(`Error processing batch ${i/batchSize + 1}:`, batchError);
        }
      }

      console.log('Final NFT count:', {
        total: allNFTs.length,
        withAudio: allNFTs.filter(nft => nft.hasValidAudio).length
      });

      setNfts(allNFTs);

    } catch (err) {
      const error = err as Error;
      console.error('NFT fetch error:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
      setError(error.message || 'Failed to fetch NFTs');
    } finally {
      setIsLoadingNFTs(false);
      console.log('=== END NFT FETCH ===');
    }
  };

  const processNFTMetadata = (nft: any): NFT => {
    const audioUrl = processMediaUrl(
      nft.metadata?.animation_url ||
      nft.metadata?.audio ||
      nft.metadata?.audio_url ||
      nft.metadata?.properties?.audio ||
      nft.metadata?.properties?.audio_url ||
      nft.metadata?.properties?.audio_file ||
      nft.metadata?.properties?.soundContent?.url
    );

    const imageUrl = processMediaUrl(
      nft.metadata?.image ||
      nft.metadata?.image_url ||
      nft.metadata?.properties?.image ||
      nft.metadata?.properties?.visual?.url
    );

    const animationUrl = processMediaUrl(
      nft.metadata?.animation_url ||
      nft.metadata?.properties?.animation_url ||
      nft.metadata?.properties?.video
    );

    // Check if it's a video/animation based on MIME type or file extension
    const mimeType = nft.metadata?.mimeType || 
                    nft.metadata?.mime_type || 
                    nft.metadata?.properties?.mimeType ||
                    nft.metadata?.content?.mime;

    const isVideo = animationUrl && (
      mimeType?.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v)$/i.test(animationUrl)
    );

    const isAnimation = animationUrl && (
      mimeType?.startsWith('model/') ||
      /\.(glb|gltf)$/i.test(animationUrl) ||
      nft.metadata?.animation_details?.format === 'gltf' ||
      nft.metadata?.animation_details?.format === 'glb'
    );

    return {
      contract: nft.contract.address,
      tokenId: nft.tokenId,
      name: nft.metadata?.name || nft.title || `#${nft.tokenId}`,
      description: nft.description || nft.metadata?.description,
      image: imageUrl || '',
      animationUrl: animationUrl || '',
      audio: audioUrl || '',
      hasValidAudio: !!audioUrl,
      isVideo,
      isAnimation,
      collection: {
        name: nft.contract.name || 'Unknown Collection',
        image: nft.contract.openSea?.imageUrl
      },
      metadata: nft.metadata
    };
  };

  // Add this effect to monitor play/pause state
  useEffect(() => {
    const currentAudio = currentlyPlaying ? 
      document.getElementById(`audio-${currentlyPlaying}`) as HTMLAudioElement : 
      null;

    if (currentAudio) {
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);

      currentAudio.addEventListener('play', handlePlay);
      currentAudio.addEventListener('pause', handlePause);
      currentAudio.addEventListener('ended', handleEnded);

      return () => {
        currentAudio.removeEventListener('play', handlePlay);
        currentAudio.removeEventListener('pause', handlePause);
        currentAudio.removeEventListener('ended', handleEnded);
      };
    }
  }, [currentlyPlaying]);

  const handleBackToSearch = () => {
    setIsSearchPage(true);
    handleStopPlaying(); // Stop any playing audio
    setIsPlayerVisible(false); // Hide the player
    setIsPlayerMinimized(true); // Reset minimizer state
    setAudioProgress(0); // Reset progress
    setIsPlaying(false); // Ensure playing state is reset
  };

  useEffect(() => {
    if (!currentPlayingNFT) return;
    
    const audioElement = document.getElementById(`audio-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`) as HTMLAudioElement;
    
    if (!audioElement) return;

    // Set initial duration when metadata is loaded
    const handleLoadedMetadata = () => {
      setAudioDurations(prev => ({
        ...prev,
        [`${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`]: audioElement.duration
      }));
    };

    // Update progress as audio plays
    const handleTimeUpdate = () => {
      const video = videoRef.current;
      if (video) {
        setLastKnownPosition(video.currentTime);
      }
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    // Set initial values if already loaded
    if (audioElement.duration) {
      setAudioDurations(prev => ({
        ...prev,
        [`${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`]: audioElement.duration
      }));
    }
    if (audioElement.currentTime) {
      setAudioProgress(audioElement.currentTime);
    }

    return () => {
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [currentPlayingNFT]);

  const fetchUserNFTs = async (user: FarcasterUser) => {
    const cachedData = getCachedNFTs(user.fid);
    if (cachedData) {
      setNfts(cachedData);
      return;
    }

    try {
      setIsLoadingNFTs(true);
      setError(''); // Clear any existing errors
      
      const nftsData = await fetchNFTsForAddress(user.fid.toString(), process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '');
      if (nftsData && Array.isArray(nftsData)) {
        cacheNFTs(user.fid, nftsData);
        setNfts(nftsData);
      }
    } catch (error) {
      console.warn('Error fetching NFTs:', error);
      // Only set error for network/API failures, not for empty results
      if (error instanceof Error && !error.message.includes('No NFTs found')) {
        setError('Unable to connect. Please try again.');
      }
    } finally {
      setIsLoadingNFTs(false);
    }
  };

  // Modify the video sync effect
  useEffect(() => {
    const video = videoRef.current;
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    
    if (!video || !audio || !currentPlayingNFT) return;

    // Only sync video position with audio when needed
    if (!isPlayerMinimized && isPlaying) {
      video.currentTime = audio.currentTime;
    }
  }, [isPlayerMinimized, currentPlayingNFT, isPlaying]);

  const preloadNFTs = useCallback((currentIndex: number) => {
    const nextNFTs = nfts.slice(currentIndex + 1, currentIndex + 3);
    nextNFTs.forEach(nft => {
      if (!preloadedMedia.has(`${nft.contract}-${nft.tokenId}`)) {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = processMediaUrl(nft.audio || '') || '';
        setPreloadedMedia(prev => new Set([...prev, `${nft.contract}-${nft.tokenId}`]));
      }
    });
  }, [nfts, preloadedMedia]);

  function handleVideoError(event: SyntheticEvent<HTMLVideoElement, Event>): void {
    throw new Error('Function not implemented.');
  }

  useEffect(() => {
    if (currentPlayingNFT?.metadata?.animation_url) {
      setIsMediaLoading(true);
      const video = videoRef.current;
      if (video) {
        video.load();  // Force load the video
      }
    }
  }, [currentPlayingNFT]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    if (!video || !audio) return;

    let lastKnownTime = 0;

    const handleEnterPiP = () => {
      setIsPictureInPicture(true);
      if (isPlaying) {
        video.currentTime = audio.currentTime;
        video.play().catch(console.warn);
      }
    };

    const handleLeavePiP = () => {
      lastKnownTime = video.currentTime;
      setIsPictureInPicture(false);
      
      // Ensure minimizer video maintains the same time
      requestAnimationFrame(() => {
        if (video) {
          video.currentTime = lastKnownTime;
          setAudioProgress(lastKnownTime);
          if (isPlaying) {
            video.play().catch(console.warn);
          }
        }
      });
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [isPlaying, currentPlayingNFT, isPlayerVisible]);

  const togglePictureInPicture = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  useEffect(() => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    
    if (!audio || !video || !currentPlayingNFT) return;

    // When minimizer visibility changes
    const handleVisibilityChange = () => {
      if (isPlaying) {
        // Keep playing regardless of minimizer state
        audio.play().catch(console.warn);
        if (video) {
          video.currentTime = audio.currentTime;
          video.play().catch(console.warn);
        }
      }
    };

    // Call immediately and add listener
    handleVisibilityChange();
    
    // Listen for minimizer state changes
    const observer = new MutationObserver(handleVisibilityChange);
    observer.observe(video.parentElement as Node, { attributes: true });

    return () => observer.disconnect();
  }, [isPlaying, currentPlayingNFT, isPlayerVisible]);

  const handleMinimize = () => {
    setIsMinimizing(true);
    setIsPlayerVisible(!isPlayerVisible);
    
    // Keep audio playing when minimizing
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    if (audio && isPlaying) {
      audio.play().catch(console.warn);
    }
  };

  const handleNFTDisplayClick = () => {
    setIsExpandButtonVisible(true);
    // Auto-hide after 2 seconds
    setTimeout(() => {
      setIsExpandButtonVisible(false);
    }, 2000);
  };

  const handlePlayPause = async () => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    const pipVideo = document.pictureInPictureElement as HTMLVideoElement;

    try {
      if (isPlaying) {
        // Pause everything
        if (audio) audio.pause();
        if (video) video.pause();
        if (pipVideo) pipVideo.pause();
        setLastKnownPosition(audio?.currentTime || video?.currentTime || 0);
        setIsPlaying(false);
      } else {
        // Resume everything from the same position
        const currentTime = lastKnownPosition;
        
        if (video) {
          video.currentTime = currentTime;
          await video.play().catch(console.warn);
        }
        if (pipVideo && pipVideo !== video) {
          pipVideo.currentTime = currentTime;
          await pipVideo.play().catch(console.warn);
        }
        if (audio) {
          audio.currentTime = currentTime;
          await audio.play().catch(console.warn);
        }
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

  // Update the PiP event handlers
  useEffect(() => {
    const video = videoRef.current;
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    
    if (!video || !audio) return;

    const handleVideoPlay = async () => {
      if (!isPlaying) {
        setIsPlaying(true);
        if (audio.paused) {
          audio.currentTime = video.currentTime;
          await audio.play().catch(console.warn);
        }
      }
    };

    const handleVideoPause = () => {
      if (isPlaying) {
        setIsPlaying(false);
        audio.pause();
        setLastKnownPosition(video.currentTime);
      }
    };

    const handlePipChange = async () => {
      const pipVideo = document.pictureInPictureElement as HTMLVideoElement | null;
      if (pipVideo) {
        // Entered PiP
        pipVideo.addEventListener('play', handleVideoPlay);
        pipVideo.addEventListener('pause', handleVideoPause);
        if (isPlaying) {
          await pipVideo.play().catch(console.warn);
        } else {
          pipVideo.pause();
        }
      }
    };

    video.addEventListener('play', handleVideoPlay);
    video.addEventListener('pause', handleVideoPause);
    video.addEventListener('enterpictureinpicture', handlePipChange);

    return () => {
      video.removeEventListener('play', handleVideoPlay);
      video.removeEventListener('pause', handleVideoPause);
      video.removeEventListener('enterpictureinpicture', handlePipChange);
      
      // Clean up PiP video listeners if needed
      const pipVideo = document.pictureInPictureElement as HTMLVideoElement | null;
      if (pipVideo) {
        pipVideo.removeEventListener('play', handleVideoPlay);
        pipVideo.removeEventListener('pause', handleVideoPause);
      }
    };
  }, [currentPlayingNFT, isPlaying]);

  // Add memoized values for expensive computations
  const memoizedAudioDurations = useMemo(() => {
    return audioDurations[`${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`] || 0;
  }, [audioDurations, currentPlayingNFT]);

  // Add this effect to load recent searches
  useEffect(() => {
    const loadRecentSearches = async () => {
      try {
        const searches = await getRecentSearches();
        setRecentSearches(searches);
      } catch (error) {
        console.error('Error loading recent searches:', error);
        setRecentSearches([]); // Set empty array as fallback
      }
    };

    loadRecentSearches();
  }, []); // Empty dependency array means this runs once on mount

  // Add this handler function
  const handleProfileClick = useCallback(() => {
    console.log('Profile clicked'); // Add this for debugging
    setIsProfileMenuOpen(!isProfileMenuOpen);
  }, [isProfileMenuOpen]);

  // Add this effect near the other useEffect declarations
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.profile-menu') && isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  // Add function to handle profile view
  const handleViewProfile = async () => {
    console.log('=== handleViewProfile START ===');
    console.log('Current userContext:', userContext);
    
    if (!userContext?.user) {
      console.error('No user context available');
      return;
    }

    try {
      console.log('Setting view states...');
      setIsProfileView(true);
      setIsLoadingNFTs(true);
      setError('');
      setNfts([]);

      console.log('Fetching wallet addresses from Airstack...');
      const query = `
        query GetFarcasterUserWalletAddresses {
          Socials(
            input: {
              filter: {
                dappName: {_eq: farcaster},
                profileName: {_eq: "${userContext.user.username}"}
              },
              blockchain: ethereum,
              limit: 50
            }
          ) {
            Social {
              dappName
              profileName
              connectedAddresses {
                address
              }
            }
          }
        }
      `;

      console.log('Making Airstack API request...');
      const response = await fetch('https://api.airstack.xyz/gql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.NEXT_PUBLIC_AIRSTACK_API_KEY || ''
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        console.error('Airstack API request failed:', response.status, response.statusText);
        throw new Error('Failed to fetch wallet addresses');
      }

      const data = await response.json();
      console.log('Airstack API response:', data);

      const addresses = data?.data?.Socials?.Social?.[0]?.connectedAddresses?.map(
        (addr: { address: string }) => addr.address
      ) || [];

      console.log('Found addresses:', addresses);

      if (addresses.length === 0) {
        throw new Error('No wallet addresses found');
      }

      // Update UI with user info
      setSelectedUser({
        fid: userContext.user.fid,
        username: userContext.user.username || '',
        display_name: userContext.user?.displayName || userContext.user?.username,
        pfp_url: userContext.user.pfpUrl,
        follower_count: 0,
        following_count: 0,
        verifiedAddresses: addresses
      });

      // Fetch NFTs for each address
      console.log('Fetching NFTs for addresses...');
      const allNFTs: NFT[] = [];
      for (const address of addresses) {
        try {
          console.log(`Fetching NFTs for address: ${address}`);
          const nftsResponse = await fetch(
            `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}/getNFTs?owner=${address}&withMetadata=true`
          );
          
          if (!nftsResponse.ok) {
            console.error(`Failed to fetch NFTs for address ${address}:`, nftsResponse.status);
            continue;
          }
          
          const nftsData = await nftsResponse.json();
          console.log(`Found ${nftsData.ownedNfts.length} NFTs for address ${address}`);
          
          const processedNFTs = nftsData.ownedNfts
            .map((nft: any) => processNFTMetadata(nft))
            .filter((nft: NFT | null) => nft && nft.hasValidAudio);
          
          console.log(`Found ${processedNFTs.length} audio NFTs for address ${address}`);
          allNFTs.push(...processedNFTs);
        } catch (error) {
          console.error(`Error fetching NFTs for address ${address}:`, error);
        }
      }

      console.log('Setting NFTs in state:', allNFTs.length);
      setNfts(allNFTs);
    } catch (error) {
      console.error('Error in handleViewProfile:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoadingNFTs(false);
      setIsProfileMenuOpen(false);
      console.log('=== handleViewProfile END ===');
    }
  };

  // Add back button handler for profile view
  const handleBackFromProfile = () => {
    setIsProfileView(false);
    setSelectedUser(null);
    setNfts([]);
    setSearchResults([]);
  };

  const handleAudioLoaded = (nftId: string) => {
    setLoadedAudioElements(prev => ({
      ...prev,
      [nftId]: true
    }));
  };

  const showExpandButton = () => {
    setIsExpandVisible(true);
    
    // Clear any existing timeout
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    
    // Set new timeout to hide button after 2 seconds
    expandTimeoutRef.current = setTimeout(() => {
      setIsExpandVisible(false);
    }, 2000);
  };

  const logNFTPlay = async (nft: NFT, fid: number) => {
    try {
      await addDoc(collection(db, 'nft_plays'), {
        timestamp: serverTimestamp(),
        fid: fid,
        nftContract: nft.contract,
        tokenId: nft.tokenId,
        name: nft.name,
        network: nft.network || 'ethereum',
        collection: nft.collection?.name || 'Unknown Collection',
        audioUrl: nft.audio || nft.metadata?.animation_url,
        image: nft.image || nft.metadata?.image
      });
    } catch (error) {
      console.warn('Failed to log NFT play:', error);
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
    setSearchResults([]);
    setNfts([]); // Corrected to setNfts instead of setFilteredNfts
    setCurrentPlayingNFT(null);
    setIsPlaying(false);
    setIsPlayerVisible(false);  // Hide the player
    setIsPlayerMinimized(false); // Reset minimized state
    setCurrentlyPlaying('');
    setError('');
  };

  // Add useEffect to fetch top played NFTs
  useEffect(() => {
    async function fetchTopPlayed() {
      try {
        const topNFTs = await getTopPlayedNFTs();
        setTopPlayedNFTs(topNFTs);
      } catch (error) {
        console.error('Error fetching top played NFTs:', error);
      }
    }
    fetchTopPlayed();
  }, []);

  // Add this helper function if you don't already have it
  const isNFTLiked = (nft: NFT) => {
    return likedNFTs.some(
      likedNFT => 
        likedNFT.contract === nft.contract && 
        likedNFT.tokenId === nft.tokenId
    );
  };

  // Then update your handleLikeToggle function
  const handleLikeToggle = async (nft: NFT) => {
    if (!userContext?.user?.fid) return;

    if (isNFTLiked(nft)) {
      // Remove from likes
      const updatedLikes = likedNFTs.filter(
        likedNFT => 
          !(likedNFT.contract === nft.contract && 
            likedNFT.tokenId === nft.tokenId)
      );
      setLikedNFTs(updatedLikes);
      await removeLikedNFT(userContext.user.fid, nft);
    } else {
      // Add to likes (only if not already present)
      if (!isNFTLiked(nft)) {
        setLikedNFTs([...likedNFTs, nft]);
        await addLikedNFT(userContext.user.fid, nft);
      }
    }
  };

  // Add this useEffect to load liked NFTs when user changes
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userContext?.user?.fid && showLikedNFTs) {
        try {
          console.log('Loading liked NFTs...');
          const liked = await getLikedNFTs(userContext.user.fid);
          console.log('Loaded liked NFTs:', liked);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [showLikedNFTs, userContext?.user?.fid]);

  // Add this to check if current NFT is liked
  useEffect(() => {
    if (currentPlayingNFT && userContext?.user?.fid) {
      const isNFTLiked = likedNFTs.some(
        nft => nft.contract === currentPlayingNFT.contract && 
               nft.tokenId === currentPlayingNFT.tokenId
      );
      setIsLiked(isNFTLiked);
    }
  }, [currentPlayingNFT, likedNFTs, userContext?.user?.fid]);

  // Add the top played section to the main page
  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 ${
      isProfileView ? 'pb-96' : ''
    }`}>
      <RetroStyles />
      <div className="container mx-auto px-4 pt-20 pb-8"> {/* Changed py-8 to pt-20 pb-8 */}
        {/* Profile Menu */}
        {userContext?.user && (
          <div 
            className="absolute top-4 right-4 z-50"
            onClick={(e) => {
              e.stopPropagation();
              console.log('Container clicked');
            }}
          >
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Profile button clicked');
                setIsProfileMenuOpen(!isProfileMenuOpen);
              }}
              className="relative profile-menu"
            >
              <Image
                src={userContext.user.pfpUrl || ''}
                alt="Profile"
                width={40}
                height={40}
                className="rounded-full border-2 border-green-400 hover:border-green-300 transition-colors"
              />
            </button>

            {isProfileMenuOpen && (
              <div 
                className="absolute right-0 mt-2 w-48 bg-gray-900 border-2 border-green-400 rounded-lg shadow-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Menu container clicked');
                }}
              >
                <div className="py-2">
                  {/* Existing profile info */}
                  <div className="px-4 py-2 border-b border-green-400/30">
                    <p className="font-mono text-green-400 truncate">
                      {userContext.user.displayName || userContext.user.username}
                    </p>
                    <p className="font-mono text-gray-400 text-sm truncate">
                      @{userContext.user.username}
                    </p>
                  </div>
                  
                  {/* Add My Likes button */}
                  <button
                    type="button"
                    onMouseEnter={() => {
                      console.log('Button hover');
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Button mousedown');
                      setShowLikedNFTs(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left font-mono text-green-400 hover:bg-green-400/10 transition-colors cursor-pointer"
                  >
                    My Likes
                  </button>
                  
                  {/* Rest of your menu items */}
                  <button
                    type="button"
                    onMouseEnter={() => console.log('Button hover')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Button mousedown');
                      // Immediately execute handleViewProfile on mousedown
                      if (typeof handleViewProfile === 'function') {
                        console.log('Executing handleViewProfile from mousedown');
                        handleViewProfile()
                          .then(() => {
                            console.log('handleViewProfile succeeded');
                            setIsProfileView(true);  // Make sure profile view is enabled
                            setIsProfileMenuOpen(false);
                          })
                          .catch(err => {
                            console.error('handleViewProfile failed:', err);
                            setError('Failed to load profile');
                          });
                      } else {
                        console.error('handleViewProfile is not available');
                      }
                    }}
                    className="w-full px-4 py-2 text-left font-mono text-green-400 hover:bg-green-400/10 transition-colors cursor-pointer"
                  >
                    My Media
                  </button>
                  <button
                    type="button"
                    onMouseEnter={() => console.log('Button hover')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Button mousedown');
                      // Reset states to return to search page
                      handleBack();
                      setIsProfileView(false);
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left font-mono text-green-400 hover:bg-green-400/10 transition-colors cursor-pointer"
                  >
                    Home
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="retro-container p-6 mb-8">
          <SearchBar onSearch={handleSearch} isSearching={isSearching} />
        </div>

        {error && error !== 'Failed to play media' && (
          <div className="retro-container p-4 mb-6 border-red-500">
            <div className="flex items-center gap-2 text-red-500">
              <div className="led-light"></div>
              <p className="font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Show search results */}
        {searchResults.length > 0 && !selectedUser && (
          <div className="retro-container p-6 mb-8">
            <h2 className="text-xl font-mono text-green-400 mb-4">SEARCH RESULTS</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {searchResults.map((user, index) => (
                <button
                  key={`search-${user.fid}-${index}`}
                  onClick={() => handleUserSelect(user)}
                  className="retro-container p-4 text-left hover:border-green-400 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {user.pfp_url ? (
                      <Image
                        src={user.pfp_url}
                        alt={user.display_name || user.username}
                        className="w-12 h-12 rounded-full border-2 border-gray-600"
                        width={48}
                        height={48}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-green-400 font-mono">
                        {(user.display_name || user.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-mono text-green-400 truncate max-w-[200px]">
                        {user.display_name || user.username}
                      </h3>
                      <p className="font-mono text-gray-400 truncate max-w-[200px]">@{user.username}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show selected user */}
        {selectedUser && (
          <div className="retro-container p-6 mb-8">
            <div className="flex items-center gap-6">
              <button
                onClick={handleBack}
                className="retro-button p-2 text-green-400 hover:text-green-300 transition-colors"
                aria-label="Go back"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>
              <div className="flex items-center gap-4 max-w-[calc(100%-4rem)] overflow-hidden">
                {selectedUser.pfp_url ? (
                  <Image
                    src={selectedUser.pfp_url}
                    alt={selectedUser.display_name || selectedUser.username || 'User avatar'}
                    className="w-16 h-16 rounded-full border-2 border-gray-600 flex-shrink-0"
                    width={64}
                    height={64}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-green-400 font-mono text-xl flex-shrink-0">
                    {(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-2xl font-mono text-green-400 truncate">
                    {selectedUser.display_name || selectedUser.username}
                  </h2>
                  <p className="font-mono text-gray-400 truncate">@{selectedUser.username}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="text-center mb-8">
            <p className="font-mono text-gray-400">Browsing @{selectedUser.username}'s collection</p>
          </div>
        )}

        {/* Loading state */}
        {isLoadingNFTs && (
          <div className="retro-container p-6 mb-8">
            <div className="flex flex-col items-center justify-center">
              <div className="tape-wheel spinning mb-4"></div>
              <p className="font-mono text-green-400 mb-2">LOADING NFTs...</p>
              <p className="font-mono text-gray-400 text-sm">Found {filteredNfts.length} NFTs with audio</p>
            </div>
          </div>
        )}

        {/* NFT display grid */}
        {filteredNfts.length > 0 && (
          <div className="retro-container p-6 bg-gray-900">
            <h3 className="text-xl font-mono text-green-400 mb-4">
              MEDIA NFTs [{filteredNfts.length}]
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredNfts.map((nft, index) => (
                <div key={`${nft.contract}-${nft.tokenId}-${index}`} 
                     className="retro-container bg-gray-800 overflow-hidden relative z-0">
                  <div className="aspect-square relative bg-gray-800">
                    {/* Always show the base image */}
                    <div className="w-full h-full absolute top-0 left-0">
                      <NFTImage 
                        src={processMediaUrl(nft.image || nft.metadata?.image || '') || '/placeholder.jpg'}
                        alt={nft.name || 'NFT'}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Show video/animation content if available */}
                    {nft.metadata?.animation_url && (
                      <div className="w-full h-full relative">
                        <video 
                          ref={videoRef}
                          src={processMediaUrl(nft.metadata.animation_url)}
                          className="w-full h-full object-cover"
                          playsInline
                          loop={false}
                          muted={true}
                          controls={false}
                          preload="auto"
                          disablePictureInPicture={false}
                          poster={nft.image ? processMediaUrl(nft.image) : undefined}
                          onLoadedData={() => {
                            const video = videoRef.current;
                            const audio = document.getElementById(`audio-${nft.contract}-${nft.tokenId}`) as HTMLAudioElement;
                            
                            if (video && audio) {
                              video.currentTime = audio.currentTime;
                              if (isPlaying) {
                                video.play().catch(console.warn);
                              }
                            }
                          }}
                        />
                      </div>
                    )}

                    <button 
                      onClick={() => handlePlayAudio(nft)}
                      className="absolute bottom-4 right-4 retro-button p-3 text-white"
                    >
                      {currentlyPlaying === `${nft.contract}-${nft.tokenId}` && isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                          <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                          <path d="M320-200v-560l440 280-440 280Z"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="retro-display p-2">
                      <div className="marquee-container">
                        <div className={`text-lg text-green-400 truncate max-w-[200px] ${
                          nft.name.length > 20 ? 'marquee-content' : ''
                        }`}>
                          {nft.name}
                        </div>
                      </div>
                    </div>
                  </div>
                  {nft.hasValidAudio && (
                    <audio
                      key={`${nft.contract}-${nft.tokenId}`}
                      id={`audio-${nft.contract}-${nft.tokenId}`}
                      src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                      onLoadedMetadata={(e) => {
                        const audio = e.target as HTMLAudioElement;
                        const nftId = `${nft.contract}-${nft.tokenId}`;
                        handleAudioLoaded(nftId);
                        setAudioDurations(prev => ({
                          ...prev,
                          [nftId]: audio.duration
                        }));
                      }}
                      preload="metadata"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Update the media player to look like a Walkman/cassette player */}
        <div
          className={`fixed bottom-0 left-0 right-0 retro-container transition-all duration-300 z-50 
            ${isPlayerMinimized 
              ? 'bg-gray-900/40 backdrop-blur-sm rounded-t-[2rem] h-20 ' + (isPlaying ? 'bg-green-900/10' : '') 
              : 'bg-gray-900/60 backdrop-blur-md rounded-t-[2rem] h-96'
            } 
            ${isPlayerVisible ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="container mx-auto px-4 h-full">
            <div className="flex flex-col h-full">
              {/* Main player row with 3 columns */}
              <div className="flex items-center justify-between gap-2 h-16">
                {/* Left play button */}
                {currentPlayingNFT && (
                  <button
                    onClick={handlePlayPause}
                    className="retro-button p-2 text-green-400 hover:text-green-300"
                  >
                    {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#75FB4C">
                        <path d="M560-200v-560h160v560H560Zm-320 0v-560h160v560H240Z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#75FB4C">
                        <path d="M320-200v-560l440 280-440 280Z"/>
                      </svg>
                    )}
                  </button>
                )}

                {/* Center content */}
                <div className="flex-1 flex justify-center">
                  <div className="retro-display p-1 min-w-[160px] max-w-[200px] text-center">
                    {currentPlayingNFT ? (
                      <h4 className="font-mono text-green-400 truncate text-lg">{currentPlayingNFT.name}</h4>
                    ) : (
                      <p className="font-mono text-lg">NO MEDIA PLAYING</p>
                    )}
                  </div>
                </div>

                {/* Right minimize button */}
                <button
                  onClick={() => setIsPlayerMinimized(!isPlayerMinimized)}
                  className="retro-button p-2 text-green-400 hover:text-green-300 transition-colors relative group"
                  aria-label={isPlayerMinimized ? "Expand player" : "Minimize player"}
                >
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${
                      isPlayerMinimized ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-green-400 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {isPlayerMinimized ? 'Expand' : 'Minimize'}
                  </span>
                </button>
              </div>

              {/* Progress bar section - only shown when not minimized */}
              {!isPlayerMinimized && currentPlayingNFT && (
                <div className="flex flex-col gap-4 py-2">
                  {/* NFT Media Display */}
                  <div className="flex justify-center">
                    <div 
                      className="relative rounded-lg overflow-hidden cursor-pointer"
                      onClick={handleNFTDisplayClick}
                    >
                      {currentPlayingNFT.metadata?.animation_url ? (
                        <div className="relative w-full h-full group" onClick={showExpandButton}>
                          <video 
                            ref={videoRef}
                            src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || '')}
                            className="w-48 h-48 object-cover"
                            playsInline
                            loop={false}
                            muted={true}
                            controls={false}
                            preload="auto"
                            onLoadedData={(e) => {
                              const video = e.target as HTMLVideoElement;
                              const isLandscape = video.videoWidth > video.videoHeight;
                              video.className = isLandscape 
                                ? "w-[320px] h-[192px] object-cover" 
                                : "w-48 h-48 object-cover";
                            }}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePictureInPicture();
                            }}
                            className={`absolute top-2 right-2 bg-black/50 p-1 rounded-full hover:bg-black/70 transition-opacity duration-300 ${
                              isExpandVisible ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              height="20" 
                              viewBox="0 -960 960 960" 
                              width="20" 
                              fill="#75FB4C"
                            >
                              <path d="M120-120v-720h720v720H120Zm120-120h480v-480H240v480Zm240-120v-240h240v240H480Z"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <NFTImage
                          src={processMediaUrl(currentPlayingNFT.image || '') || '/placeholder.jpg'}
                          alt={currentPlayingNFT.name || 'NFT'}
                          className="w-48 h-48 object-cover"
                          width={192}
                          height={192}
                        />
                      )}
                    </div>
                  </div>

                  {/* Audio Controls */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-green-400 text-base min-w-[40px]">
                      {Math.floor(audioProgress / 60)}:{String(Math.floor(audioProgress % 60)).padStart(2, '0')}
                    </span>
                    
                    {/* Rewind Button */}
                    <button
                      onClick={() => handleSeekOffset(-10)}
                      className="retro-button p-1 text-green-400 hover:text-green-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#75FB4C">
                        <path d="M860-240 500-480l360-240v480Zm-400 0L100-480l360-240v480Zm-80-240Zm400 0Zm-400 90v-180l-136 90 136 90Zm400 0v-180l-136 90 136 90Z"/>
                      </svg>
                    </button>
                    
                    <div className="flex-1 relative">
                      <input
                        type="range"
                        min={0}
                        max={memoizedAudioDurations}
                        value={audioProgress}
                        onChange={(e) => handleSeek(Number(e.target.value))}
                        className="retro-progress w-full"
                        style={{
                          background: `linear-gradient(to right, #4ade80 ${(audioProgress / memoizedAudioDurations) * 100}%)`
                        }}
                      />
                      <div className="absolute -top-1 left-1">
                        <div className="w-5 h-5">
                          <AudioVisualizer 
                            audioElement={document.getElementById(`audio-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`) as HTMLAudioElement} 
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Fast Forward Button */}
                    <button
                      onClick={() => handleSeekOffset(10)}
                      className="retro-button p-1 text-green-400 hover:text-green-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#75FB4C">
                        <path d="M100-240v-480l360 240-360 240Zm400 0v-480l360 240-360 240ZM180-480Zm400 0Zm-400 90l136-90-136-90v180Zm400 0l136-90-136-90v180Z"/>
                      </svg>
                    </button>

                    <span className="font-mono text-green-400 text-base min-w-[40px]">
                      {Math.floor(memoizedAudioDurations / 60)}:{String(Math.floor(memoizedAudioDurations % 60)).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Glowing POD Playr text */}
                  <div className="relative">
                    <span className="absolute left-1/2 transform -translate-x-1/2 font-mono text-white text-lg tracking-wider filter drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">
                      POD PLAYR
                    </span>
                    <button
                      onClick={() => handleLikeToggle(currentPlayingNFT)}
                      className={`absolute right-4 retro-button p-1 ${isLiked ? 'text-red-500' : 'text-gray-400'} hover:text-red-500 transition-colors`}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-6 w-6" 
                        fill={isLiked ? "currentColor" : "none"} 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" 
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {!selectedUser && (
        <>
          {/* Top Played NFTs Section */}
          {!selectedUser && !showLikedNFTs && (
            <>
              {topPlayedNFTs.length > 0 && (
                <div className="retro-container p-6 mb-8">
                  <h2 className="text-xl font-mono text-green-400 mb-4">TOP PLAYED NFTs</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {topPlayedNFTs.map(({nft, count}, index) => (
                      <div 
                        key={`${nft.contract}-${nft.tokenId}`}
                        className="retro-container p-4 bg-gray-800 relative"
                      >
                        <div className="aspect-square relative mb-2">
                          <NFTImage
                            src={nft.metadata?.image || ''}
                            alt={nft.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 bg-green-400 text-black font-mono px-2 py-1 text-sm">
                            #{index + 1}
                          </div>
                          <div className="absolute top-2 right-2 bg-purple-500 text-white font-mono px-2 py-1 text-sm">
                            {count} plays
                          </div>
                          <button 
                            onClick={() => handlePlayAudio(nft)}
                            className="absolute bottom-4 right-4 retro-button p-3 text-white"
                          >
                            {currentlyPlaying === `${nft.contract}-${nft.tokenId}` && isPlaying ? (
                              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                                <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                                <path d="M320-200v-560l440 280-440 280Z"/>
                              </svg>
                            )}
                          </button>
                        </div>
                        <h3 className="font-mono text-green-400 truncate">{nft.name}</h3>
                        <audio
                          id={`audio-${nft.contract}-${nft.tokenId}`}
                          src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                          preload="none"
                          onTimeUpdate={(e) => {
                            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                              setAudioProgress((e.target as HTMLAudioElement).currentTime);
                            }
                          }}
                          onEnded={() => {
                            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                              setIsPlaying(false);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Rest of the existing content */}
            </>
          )}
          {/* Separate Liked NFTs View */}
          {showLikedNFTs && (
            <div className="retro-container p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-mono text-green-400">My Liked NFTs</h2>
                <button
                  onClick={() => setShowLikedNFTs(false)}
                  className="retro-button p-2 text-green-400 hover:text-green-300"
                >
                  Back
                </button>
              </div>
              
              {likedNFTs.length === 0 ? (
                <p className="text-center font-mono text-gray-400 py-8">
                  No liked NFTs yet. Start liking some music!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {likedNFTs.map((nft) => (
                    <div
                      key={`${nft.contract}-${nft.tokenId}`}
                      className="retro-container p-4 bg-gray-800 relative"
                    >
                      <div className="aspect-square relative mb-2">
                        <NFTImage
                          src={processMediaUrl(nft.metadata?.image || nft.image || '') || '/placeholder.jpg'}
                          alt={nft.name || 'NFT'}
                          className="w-full h-full object-cover"
                        />
                        <button 
                          onClick={() => handlePlayAudio(nft)}
                          className="absolute bottom-4 right-4 retro-button p-3 text-white"
                        >
                          {currentlyPlaying === `${nft.contract}-${nft.tokenId}` && isPlaying ? (
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                              <path d="M320-640v320h80V-640h-80Zm240 0v320h80V-640h-80Z"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                              <path d="M320-200v-560l440 280-440 280Z"/>
                            </svg>
                          )}
                        </button>
                        <audio
                          id={`audio-${nft.contract}-${nft.tokenId}`}
                          src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                          preload="none"
                          onTimeUpdate={(e) => {
                            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                              setAudioProgress((e.target as HTMLAudioElement).currentTime);
                            }
                          }}
                          onEnded={() => {
                            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                              setIsPlaying(false);
                            }
                          }}
                        />
                      </div>
                      <h3 className="font-mono text-green-400 truncate">{nft.name}</h3>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const fetchWithRetry = async (url: string, retries = 3): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      return response;
    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
};

const fetchNFTsWithPagination = async (baseUrl: string, startToken?: string) => {
  const url = startToken 
    ? `${baseUrl}&pageKey=${startToken}`
    : baseUrl;
  
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Failed to fetch NFTs:', error);
    return null;
  }
};

const fetchNFTs = async (fid: number): Promise<NFT[]> => {
  const allNFTs: NFT[] = [];
  const ITEMS_PER_PAGE = 50;
  const MAX_ITEMS = 100;

  try {
    const address = await getUserAddress(fid);
    if (address === null) return [];

    // Fetch from Mainnet with pagination
    const mainnetBaseUrl = `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=${ITEMS_PER_PAGE}`;
    
    let pageKey = undefined;
    let totalMainnetNFTs = 0;

    do {
      const data = await fetchNFTsWithPagination(mainnetBaseUrl, pageKey);
      if (!data) break;

      if (data.ownedNfts?.length) {
        const processedNFTs = data.ownedNfts
          .map((nft: any) => {
            try {
              return processNFTMetadata(nft);
            } catch (error) {
              console.warn('[NFT Fetch] Mainnet processing error:', error);
              return null;
            }
          })
          .filter((nft: NFT | null) => nft && nft.hasValidAudio);

        allNFTs.push(...processedNFTs);
        totalMainnetNFTs += processedNFTs.length;
      }

      pageKey = data.pageKey;
    } while (pageKey && totalMainnetNFTs < MAX_ITEMS);

    // Rest of the function remains the same...
  } catch (error) {
    console.error('[NFT Fetch] Network error:', error);
  }

  return allNFTs;
};

function resetPlaybackStates() {
  throw new Error('Function not implemented.');
}

async function getUserAddress(fid: number): Promise<string | null> {
  try {
    // Your existing getUserAddress implementation
    // Make sure it returns a string or null
    return "0x..."; // Replace with actual implementation
  } catch (error) {
    console.error('[Get Address] Error:', error);
    return null;
  }
}

function processNFTMetadata(nft: any) {
  throw new Error('Function not implemented.');
}