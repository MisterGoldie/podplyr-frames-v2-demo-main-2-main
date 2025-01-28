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

      <div className="relative mt-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Explore Farcaster users.."
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
  playTracked?: boolean;
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

  /* Add scrollbar hiding styles */
  .hide-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;     /* Firefox */
  }

  .hide-scrollbar::-webkit-scrollbar {
    display: none;             /* Chrome, Safari and Opera */
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

const processMediaUrl = (url: string | undefined): string => {
  if (!url) return '';

  // Trim any whitespace and remove any duplicate URLs that might have been concatenated
  const trimmedUrl = url.trim();
  
  // Handle Arweave URLs - check if it's a direct Arweave hash
  if (trimmedUrl.match(/^[a-zA-Z0-9_-]{43}$/)) {
    return `https://arweave.net/${trimmedUrl}`;
  }

  // Handle Arweave URLs with protocol
  if (trimmedUrl.startsWith('ar://')) {
    const hash = trimmedUrl.slice(5);
    return `https://arweave.net/${hash}`;
  }

  // Handle direct arweave.net URLs that might have been duplicated
  if (trimmedUrl.includes('arweave.net')) {
    const match = trimmedUrl.match(/https:\/\/arweave\.net\/([a-zA-Z0-9_-]{43})/);
    if (match) {
      return `https://arweave.net/${match[1]}`;
    }
  }

  // Handle IPFS URLs
  if (trimmedUrl.startsWith('ipfs://')) {
    return `${IPFS_GATEWAYS[0]}${trimmedUrl.slice(7)}`;
  }

  // For regular HTTP(S) URLs, ensure no duplication and proper encoding
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
    // Remove any duplicated URLs that might have been concatenated
    const urlParts = trimmedUrl.split(/https?:\/\//);
    const lastPart = urlParts[urlParts.length - 1];
    return `https://${lastPart}`;
  }

  // If it's not a recognized format, return the encoded URL
  return encodeURI(trimmedUrl);
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
  priority?: boolean;  // Add this prop
}

const NFTImage = ({ src, alt, className, width, height, priority }: NFTImageProps) => {
  const fallbackSrc = '/images/video-placeholder.png';
  const [isVideo, setIsVideo] = useState(false);

  // Check if URL is likely a video based on extension or metadata
  useEffect(() => {
    const detectVideoContent = (url: string) => {
      // Check common video extensions
      const videoExtensions = /\.(mp4|webm|ogg|mov)$/i;
      
      // Check if URL contains video indicators
      const isVideoUrl = 
        videoExtensions.test(url) || 
        url.includes('animation_url') ||
        url.includes('/video/');

      setIsVideo(isVideoUrl);
    };

    if (src) {
      const processedUrl = processMediaUrl(src);
      detectVideoContent(processedUrl);
    }
  }, [src]);

  if (isVideo) {
    return (
      <div className={className} style={{ width, height, position: 'relative' }}>
        <video
          src={processMediaUrl(src)}
          className="w-full h-full object-cover"
          preload="metadata"
          playsInline
          muted // Add muted to allow autoplay preview
          loop // Optional: loop the preview
          autoPlay // Optional: autoplay the preview
        >
          <source src={processMediaUrl(src)} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            height="24px" 
            viewBox="0 -960 960 960" 
            width="24px" 
            fill="currentColor" 
            className="w-12 h-12 text-white opacity-75"
          >
            <path d="M320-200v-560l440 280-440 280Z"/>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={src || fallbackSrc}
      alt={alt}
      className={className}
      width={width || 500}
      height={height || 500}
      priority={priority}
      unoptimized={true}
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

// Add this component definition before the Demo component
interface NFTCardProps {
  nft: NFT;
  onPlay: (nft: NFT) => void;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
}

const NFTCard: React.FC<NFTCardProps> = ({ nft, onPlay, isPlaying, currentlyPlaying, handlePlayPause }) => {
  return (
    <div 
      className="retro-container bg-gray-800 overflow-hidden relative z-0"
    >
      <div className="aspect-square relative bg-gray-800">
        {/* Base image or video */}
        <div className="w-full h-full absolute top-0 left-0">
          <NFTImage
            src={processMediaUrl(nft.image || nft.metadata?.image || '')}
            alt={nft.name || 'NFT'}
            className="w-full h-full object-cover"
            width={192}
            height={192}
            priority={true}
          />
        </div>

        {/* Play button */}
        <button 
          onClick={(e) => {
            e.preventDefault();
            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
              // If this NFT is currently playing, toggle play/pause
              handlePlayPause();
            } else {
              // If this is a different NFT, start playing it
              onPlay(nft);
            }
          }}
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
      
      {/* NFT name */}
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

      {/* Audio element */}
      {nft.hasValidAudio && (
        <audio
          id={`audio-${nft.contract}-${nft.tokenId}`}
          src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
          preload="metadata"
        />
      )}
    </div>
  );
};

// Add new interface for page states
interface PageState {
  isHome: boolean;
  isExplore: boolean;
  isLibrary: boolean;
  isProfile: boolean;
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
  // Set initial state to false
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
      console.log('[playMedia] Starting playback for NFT:', nft.contract);
      const nftId = `${nft.contract}-${nft.tokenId}`;
      let mediaStarted = false;
      
      // Set playing state first
      setIsPlaying(true);
      
      // Get the media URL with a fallback
      const mediaUrl = processMediaUrl(nft.audio || nft.metadata?.animation_url || '');
      if (!mediaUrl) {
        throw new Error('No valid media URL found');
      }
      
      // Only load video if it's a video NFT and not already loaded
      if (video && nft.metadata?.animation_url && 
          (!video.src || !video.src.includes(nft.metadata.animation_url))) {
        const videoUrl = processMediaUrl(nft.metadata.animation_url);
        if (videoUrl) {
          console.log('[playMedia] Loading video:', videoUrl);
          video.src = videoUrl;
          video.load();
          
          // Wait for video to be ready
          await new Promise((resolve) => {
            video.oncanplay = resolve;
          });
        }
      }

      // Load and play audio
      if (!audio.src || audio.src !== mediaUrl) {
        console.log('[playMedia] Loading audio:', mediaUrl);
        audio.src = mediaUrl;
        audio.load();
        
        // Wait for audio to be ready
        await new Promise((resolve) => {
          audio.oncanplay = resolve;
        });
      }

      // Start playback
      const playPromises: Promise<void>[] = [];

      // Play audio if it exists
      if (audio && !audio.error) {
        console.log('[playMedia] Starting audio playback');
        playPromises.push(audio.play());
        mediaStarted = true;
      }

      // Play video if exists
      if (video && !video.error) {
        console.log('[playMedia] Starting video playback');
        video.currentTime = audio?.currentTime || 0;
        playPromises.push(video.play());
        mediaStarted = true;
      }

      // Wait for media to start playing
      await Promise.all(playPromises);

      // Only track play if media actually started and hasn't been tracked
      if (mediaStarted && userContext?.user?.fid && !nft.playTracked) {
        console.log('[playMedia] Tracking play for NFT:', nftId);
        await trackNFTPlay(nft, userContext.user.fid);
        nft.playTracked = true; // Mark this play as tracked
        console.log('[playMedia] Play tracked successfully');
      } else {
        console.log('[playMedia] Skipping play tracking:', {
          mediaStarted,
          hasFid: !!userContext?.user?.fid,
          alreadyTracked: nft.playTracked
        });
      }

    } catch (error) {
      console.error('[playMedia] Playback error:', error);
      setIsPlaying(false);
      throw error;
    }
  };

  const handlePlayAudio = async (nft: NFT) => {
    try {
      const nftId = `${nft.contract}-${nft.tokenId}`;
      console.log('[handlePlayAudio] Starting playback for NFT:', nftId);
      
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

      // Set new NFT as current first
      setCurrentlyPlaying(nftId);
      setCurrentPlayingNFT(nft);
      setIsPlayerVisible(true);
      // Always start in minimized mode
      setIsPlayerMinimized(true);
      
      // Clear previous audio source and reload
      const audio = document.getElementById(`audio-${nftId}`) as HTMLAudioElement;
      if (audio && nft.hasValidAudio) {
        setIsPlaying(true); // Set playing state before starting media
        await playMedia(audio, videoRef.current, nft);
      }

    } catch (error) {
      console.error('[handlePlayAudio] Playback error:', error);
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

  // Add these utility functions near the top of the file
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // If we hit the rate limit, wait and retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 2000;
          console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await delay(waitTime);
          continue;
        }
        
        return response;
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        lastError = error as Error;
        
        // Wait longer between retries
        await delay(1000 * (attempt + 1));
      }
    }
    
    throw lastError || new Error('Failed to fetch after retries');
  };

  // Update the fetchNFTsForAddress function
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

      const response = await fetchWithRetry(mainnetUrl, options);
      
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

      // Try Base network with same format, but with delay to avoid rate limits
      try {
        await delay(1000); // Wait 1 second before making Base request
        
        const baseUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`;
        
        const baseResponse = await fetchWithRetry(baseUrl, options);
        
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

  // Update handleUserSelect to process addresses sequentially instead of in parallel
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

      // Fetch user profile from Neynar
      const profileResponse = await fetchWithRetry(
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
        throw new Error(`Failed to fetch user profile: ${errorText}`);
      }

      const profileData = await profileResponse.json();
      let allAddresses: string[] = [];

      // Get verified addresses
      if (profileData.users?.[0]?.verifications) {
        allAddresses = [...profileData.users[0].verifications];
      }

      // Get custody address
      if (profileData.users?.[0]?.custody_address) {
        allAddresses.push(profileData.users[0].custody_address);
      }

      // Filter addresses
      allAddresses = [...new Set(allAddresses)].filter(addr => 
        addr && addr.startsWith('0x') && addr.length === 42
      );

      if (allAddresses.length === 0) {
        throw new Error('No valid addresses found for this user');
      }

      setSelectedUser({
        ...user,
        verifiedAddresses: allAddresses
      });

      // Process addresses sequentially instead of in batches
      const allNFTs: NFT[] = [];
      
      for (let i = 0; i < allAddresses.length; i++) {
        const address = allAddresses[i];
        console.log(`Processing address ${i + 1}/${allAddresses.length}:`, address);
        
        try {
          const nfts = await fetchNFTsForAddress(address, alchemyKey);
          allNFTs.push(...nfts);
          
          // Add delay between addresses if not the last one
          if (i < allAddresses.length - 1) {
            await delay(2000); // Wait 2 seconds between addresses
          }
        } catch (error) {
          console.error(`Error processing address ${address}:`, error);
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
    console.log('=== START NFT FETCH ===');
    
    if (!userContext?.user) {
      console.error('No user context available');
      return;
    }

    try {
      // Set initial states
      setIsProfileView(true);
      setIsLoadingNFTs(true);
      setError('');
      setNfts([]);
      setSearchResults([]);
      setSelectedUser(null);

      // Check API keys
      const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      console.log('API Keys present:', {
        hasNeynarKey: !!neynarKey,
        hasAlchemyKey: !!alchemyKey
      });

      // Log user being processed
      console.log('Processing user:', {
        fid: userContext.user.fid,
        username: userContext.user.username
      });

      // First get the custody address from Neynar
      const profileResponse = await fetchWithRetry(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${userContext.user.fid}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey || ''
          }
        }
      );

      const profileData = await profileResponse.json();
      console.log('Profile data received:', profileData);

      let allAddresses: string[] = [];

      // Get verified addresses from profile data
      if (profileData.users?.[0]) {
        const user = profileData.users[0];
        
        // Handle verified addresses
        if (user.verified_addresses) {
          try {
            // Log raw data for debugging
            console.log('Raw verified addresses:', user.verified_addresses);
            
            // Extract ETH addresses
            if (user.verified_addresses.eth_addresses && 
                Array.isArray(user.verified_addresses.eth_addresses)) {
              const ethAddresses = user.verified_addresses.eth_addresses
                .filter((addr: unknown): addr is string => typeof addr === 'string')
                .map((addr: string) => addr.toLowerCase());
              
              allAddresses.push(...ethAddresses);
            }
            
            console.log('Verified addresses found:', allAddresses);
          } catch (error) {
            console.warn('Error processing verified addresses:', error);
          }
        }

        // Add custody address if it exists
        if (user.custody_address) {
          const custodyAddress = user.custody_address.toLowerCase();
          if (!allAddresses.includes(custodyAddress)) {
            allAddresses.push(custodyAddress);
            console.log('Added custody address:', custodyAddress);
          }
        }
      }

      // Remove duplicates and log final addresses
      allAddresses = [...new Set(allAddresses)];
      console.log('Final addresses to check:', allAddresses);

      // Process addresses in batches
      const BATCH_SIZE = 2;
      const allNFTs: NFT[] = [];
      
      for (let i = 0; i < allAddresses.length; i += BATCH_SIZE) {
        const batch = allAddresses.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batch);

        const batchPromises = batch.map(async (address) => {
          try {
            // Use the same fetchNFTsForAddress helper function
            const nfts = await fetchNFTsForAddress(address, alchemyKey || '');
            console.log(`[NFT Fetch] Found ${nfts.length} NFTs for address ${address}`);
            return { address, nfts };
          } catch (error) {
            console.error(`[NFT Fetch] Error fetching NFTs for ${address}:`, error);
            return { address, nfts: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        // Process NFTs from this batch
        const batchNFTs = batchResults.flatMap(result => result.nfts);
        allNFTs.push(...batchNFTs);

        console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} results:`, {
          totalNFTs: allNFTs.length,
          addressesProcessed: batch
        });

        // Add delay between batches if not the last batch
        if (i + BATCH_SIZE < allAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('Final NFT count:', {
        total: allNFTs.length,
        withAudio: allNFTs.filter(nft => nft.hasValidAudio).length
      });

      // Update state with found NFTs
      setNfts(allNFTs);

    } catch (error) {
      console.error('Error in handleViewProfile:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoadingNFTs(false);
      setIsProfileMenuOpen(false);
      console.log('=== END NFT FETCH ===');
    }
  };

  // Helper function to validate audio NFTs
  const isValidAudioNFT = (url: string): boolean => {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const lowerUrl = url.toLowerCase();
    return audioExtensions.some(ext => lowerUrl.endsWith(ext)) || 
           lowerUrl.includes('audio') ||
           lowerUrl.includes('music');
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

  // Add initialization effect
  useEffect(() => {
    // Ensure player is hidden on initial load
    setIsPlayerVisible(false);
    setIsPlayerMinimized(true);
  }, []);

  // Add new state for page management
  const [currentPage, setCurrentPage] = useState<PageState>({
    isHome: true,
    isExplore: false,
    isLibrary: false,
    isProfile: false
  });

  // Add helper function to switch pages
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

  // Add the top played section to the main page
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <RetroStyles />
      
      {/* Top Navigation Bar - Only show when not on Explore page */}
      {!currentPage.isExplore && (
        <div className="fixed top-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-b border-green-400/20 h-[64px] z-30">
          <div className="container mx-auto px-4 h-full">
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-mono text-green-400 tracking-widest">PODPLAYR</h1>
                <div className="flex items-end space-x-1 h-3">
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
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - Adjust padding based on page */}
      <div className={`container mx-auto px-4 ${currentPage.isExplore ? 'pt-4' : 'pt-20'} pb-24`}>
        {/* Home Page */}
        {currentPage.isHome && (
          <div>
            {/* Top Played NFTs Section */}
            {topPlayedNFTs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-6 px-2">Top Played</h2>
                <div className="relative">
                  <div className="overflow-x-auto pb-4 hide-scrollbar">
                    <div className="flex gap-4 px-2">
                      {topPlayedNFTs.map(({nft, count}, index) => (
                        <div 
                          key={`${nft.contract}-${nft.tokenId}`}
                          className="flex-shrink-0 w-[160px] group"
                        >
                          <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20">
                            <NFTImage
                              src={nft.metadata?.image || ''}
                              alt={nft.name}
                              className="w-full h-full object-cover"
                              width={160}
                              height={160}
                              priority={true}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            <button 
                              onClick={() => handlePlayAudio(nft)}
                              className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-green-400 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-105 transform"
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
                          <div className="px-1">
                            <h3 className="font-mono text-white text-sm truncate mb-1">{nft.name}</h3>
                            <p className="font-mono text-gray-400 text-xs truncate">{nft.collection?.name || 'Unknown Collection'}</p>
                          </div>
                          <audio
                            id={`audio-${nft.contract}-${nft.tokenId}`}
                            src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                            preload="none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Explore Page */}
        {currentPage.isExplore && (
          <div>
            <div className="flex items-center gap-4 mb-8">
              <button 
                onClick={() => switchPage('isHome')}
                className="text-green-400 hover:text-green-300 transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                  <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
                </svg>
              </button>
              <div className="flex-grow">
                <SearchBar onSearch={handleSearch} isSearching={isSearching} />
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedUser && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {searchResults.map((user, index) => (
                  <button
                    key={`search-${user.fid}-${index}`}
                    onClick={() => handleUserSelect(user)}
                    className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg text-left hover:bg-gray-800/70 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {user.pfp_url ? (
                        <Image
                          src={user.pfp_url}
                          alt={user.display_name || user.username}
                          className="w-12 h-12 rounded-full"
                          width={48}
                          height={48}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-green-400 font-mono">
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
            )}

            {/* Selected User NFTs */}
            {selectedUser && (
              <div>
                <button 
                  onClick={handleBack}
                  className="mb-6 flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                    <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
                  </svg>
                  <span className="font-mono">Back to Search</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {isLoadingNFTs ? (
                    <div className="col-span-full text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
                      <p className="mt-4 font-mono text-green-400">Loading NFTs...</p>
                    </div>
                  ) : nfts.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                      <p className="font-mono text-gray-400">No audio NFTs found</p>
                    </div>
                  ) : (
                    nfts.map((nft) => (
                      <NFTCard
                        key={`${nft.contract}-${nft.tokenId}`}
                        nft={nft}
                        onPlay={handlePlayAudio}
                        isPlaying={isPlaying}
                        currentlyPlaying={currentlyPlaying}
                        handlePlayPause={handlePlayPause}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Library Page */}
        {currentPage.isLibrary && (
          <div>
            <div className="mb-8">
              <h2 className="text-xl font-mono text-green-400 mb-6">My Liked NFTs</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {likedNFTs.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <p className="font-mono text-gray-400">No liked NFTs yet. Start liking some music!</p>
                  </div>
                ) : (
                  likedNFTs.map((nft) => (
                    <NFTCard
                      key={`${nft.contract}-${nft.tokenId}`}
                      nft={nft}
                      onPlay={handlePlayAudio}
                      isPlaying={isPlaying}
                      currentlyPlaying={currentlyPlaying}
                      handlePlayPause={handlePlayPause}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile Page */}
        {currentPage.isProfile && userContext?.user && (
          <div>
            <div className="mb-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full overflow-hidden">
                  <Image
                    src={userContext.user.pfpUrl || '/placeholder-avatar.png'}
                    alt="Profile"
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-mono text-green-400 mb-2">
                    {userContext.user.displayName || userContext.user.username || `User ${userContext.user.fid}`}
                  </h2>
                  {userContext.user.username && (
                    <p className="font-mono text-gray-400">@{userContext.user.username}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {isLoadingNFTs ? (
                  <div className="col-span-full text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400"></div>
                    <p className="mt-4 font-mono text-green-400">Loading your NFTs...</p>
                  </div>
                ) : nfts.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <p className="font-mono text-gray-400">No audio NFTs found in your collection</p>
                  </div>
                ) : (
                  nfts.map((nft) => (
                    <NFTCard
                      key={`${nft.contract}-${nft.tokenId}`}
                      nft={nft}
                      onPlay={handlePlayAudio}
                      isPlaying={isPlaying}
                      currentlyPlaying={currentlyPlaying}
                      handlePlayPause={handlePlayPause}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-green-400/20 h-[64px] z-40">
        <div className="container mx-auto px-4 py-2.5">
          <div className="flex justify-around items-center h-full">
            {/* Home Button */}
            <button 
              onClick={() => switchPage('isHome')}
              className={`flex flex-col items-center gap-1 transition-colors ${
                currentPage.isHome ? 'text-green-400' : 'text-gray-400 hover:text-green-400'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/>
              </svg>
              <span className="text-xs font-mono">Home</span>
            </button>

            {/* Explore Button */}
            <button 
              onClick={() => switchPage('isExplore')}
              className={`flex flex-col items-center gap-1 transition-colors ${
                currentPage.isExplore ? 'text-green-400' : 'text-gray-400 hover:text-green-400'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
              </svg>
              <span className="text-xs font-mono">Explore</span>
            </button>

            {/* Library Button */}
            <button 
              onClick={() => switchPage('isLibrary')}
              className={`flex flex-col items-center gap-1 transition-colors ${
                currentPage.isLibrary ? 'text-green-400' : 'text-gray-400 hover:text-green-400'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
              </svg>
              <span className="text-xs font-mono">Library</span>
            </button>

            {/* Profile Button */}
            {userContext?.user && (
              <button 
                onClick={() => switchPage('isProfile')}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  currentPage.isProfile ? 'text-green-400' : 'text-gray-400 hover:text-green-400'
                }`}
              >
                <div className="relative w-6 h-6 rounded-full overflow-hidden">
                  <Image
                    src={userContext.user.pfpUrl || '/placeholder-avatar.png'}
                    alt="Profile"
                    width={24}
                    height={24}
                    className="object-cover"
                  />
                </div>
                <span className="text-xs font-mono">Profile</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



