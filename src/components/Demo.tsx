"use client";

import Image from 'next/image';
import { useEffect, useCallback, useState, useMemo, useRef, ReactEventHandler, SyntheticEvent } from "react";
import { debounce } from 'lodash';
import { trackUserSearch, getRecentSearches, SearchedUser, getTopPlayedNFTs, fetchNFTDetails, trackNFTPlay, toggleLikeNFT, getLikedNFTs, removeLikedNFT, addLikedNFT, subscribeToRecentPlays } from '../lib/firebase';
import sdk, { type FrameContext } from "@farcaster/frame-sdk";
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc } from 'firebase/firestore';


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
  quantity?: number;
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

// Update the ExtendedFrameContext interface
interface ExtendedFrameContext extends Omit<FrameContext, 'user'> {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    custody_address?: string;
    verified_addresses?: {
      eth_addresses?: string[];
    };
  };
}

// Add this interface near other interfaces
interface GroupedNFT extends Omit<NFT, 'quantity'> {
  quantity: number;
}

// Add this utility function before the Demo component
const groupNFTsByUniqueId = (nfts: NFT[]): NFT[] => {
  const groupedMap = nfts.reduce((acc: Map<string, NFT>, nft: NFT) => {
    // Create a more reliable unique key by using full contract address and cleaned tokenId
    let cleanTokenId = nft.tokenId;
    
    // Try to extract tokenId from animation_url if present
    if (nft.metadata?.animation_url) {
      const animationMatch = nft.metadata.animation_url.match(/\/(\d+)\./);
      if (animationMatch) {
        cleanTokenId = animationMatch[1];
      }
    }
    
    // If still no tokenId, use a hash of contract and name
    if (!cleanTokenId) {
      cleanTokenId = `0x${nft.contract.slice(0, 10)}`;
    }
    
    const key = `${nft.contract.toLowerCase()}-${cleanTokenId}`;
    
    if (!acc.has(key)) {
      acc.set(key, {
        ...nft,
        quantity: 1,
        tokenId: cleanTokenId // Use the cleaned tokenId
      });
    } else {
      const existing = acc.get(key)!;
      existing.quantity = (existing.quantity || 1) + 1;
    }
    
    return acc;
  }, new Map<string, NFT>());

  return Array.from(groupedMap.values());
};

// Update the NFTCardProps interface
interface NFTCardProps {
  nft: NFT;
  onPlay: (nft: NFT) => void;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
  publicCollections?: PublicCollection[];
  onAddToCollection?: (nft: NFT, collectionId: string) => void;
  onRemoveFromCollection?: (nft: NFT, collectionId: string) => void;
}

// Update the NFTCard component
const NFTCard: React.FC<NFTCardProps> = ({ 
  nft, 
  onPlay, 
  isPlaying, 
  currentlyPlaying, 
  handlePlayPause,
  publicCollections,
  onAddToCollection,
  onRemoveFromCollection
}) => {
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);

  return (
    <div className="group relative">
      <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20">
        <NFTImage
          src={processMediaUrl(nft.image || nft.metadata?.image || '')}
          alt={nft.name || 'NFT'}
          className="w-full h-full object-cover"
          width={160}
          height={160}
          priority={true}
        />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        
        {/* Play Button */}
        <button 
          onClick={() => {
            if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
              handlePlayPause();
            } else {
              onPlay(nft);
            }
          }}
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
        <h3 className={`font-mono text-white text-sm truncate mb-1 ${nft.name.length > 20 ? 'marquee-content' : ''}`}>
          {nft.name}
        </h3>
        <p className="font-mono text-gray-400 text-xs truncate">{nft.collection?.name || 'Unknown Collection'}</p>
      </div>
      {nft.hasValidAudio && (
        <audio
          id={`audio-${nft.contract}-${nft.tokenId}`}
          src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
          preload="none"
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

// Add near the top with other utility functions
const formatTime = (seconds: number): string => {
  if (!seconds) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Add this interface near the top with other interfaces
interface NFTPlayData {
  fid: number;
  nftContract: string;
  tokenId: string;
  name: string;
  image: string;
  audioUrl: string;
  collection: string;
  network: string;
  timestamp: any;
}

// Add these new interfaces near the top with other interfaces
interface UserWalletInfo {
  custody_address: string;
  verified_addresses: {
    eth_addresses?: string[];
  };
}

interface UserProfileData {
  user: {
    fid: number;
    username: string;
    display_name?: string;
    pfp_url?: string;
    custody_address?: string;
    verified_addresses?: {
      eth_addresses?: string[];
    };
  };
}

// Add these interfaces near other interfaces
interface PublicCollection {
  id: string;
  name: string;
  description?: string;
  nfts: NFT[];
  createdAt: any;
  updatedAt: any;
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
  // Add new state for top played NFTs
  const [topPlayedNFTs, setTopPlayedNFTs] = useState<{ nft: NFT; count: number }[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [likedNFTs, setLikedNFTs] = useState<NFT[]>([]);
  // Add this state
  const [showLikedNFTs, setShowLikedNFTs] = useState(false);
  // Add state for recently played NFTs
  const [recentlyPlayedNFTs, setRecentlyPlayedNFTs] = useState<NFT[]>([]);

  // Add these new state variables near other state declarations
  const [filterView, setFilterView] = useState<'grid' | 'list'>('list');
  const [filterSort, setFilterSort] = useState<'recent' | 'name' | 'collection'>('recent');
  const [searchFilter, setSearchFilter] = useState('');
  
  // Add near other state declarations (around line 661)
  const NFT_CACHE_KEY = 'nft-cache-';
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  const [publicCollections, setPublicCollections] = useState<PublicCollection[]>([]);
  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<PublicCollection | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');

  // Add this with other state/ref declarations at the top of the component
  let expandTimeout: NodeJS.Timeout | null = null;

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

  // Add function to fetch recently played NFTs
  const fetchRecentlyPlayed = useCallback(async () => {
    if (!userContext?.user?.fid) return;

    try {
      const recentlyPlayedCollection = collection(db, 'nft_plays');
      const q = query(
        recentlyPlayedCollection,
        where('fid', '==', userContext.user.fid),
        orderBy('timestamp', 'desc'),
        limit(8)
      );

      const querySnapshot = await getDocs(q);
      const recentPlays = querySnapshot.docs.map(doc => {
        const data = doc.data() as NFTPlayData;
        return {
          contract: data.nftContract || '',
          tokenId: data.tokenId || '',
          name: data.name || '',
          image: data.image || '',
          audio: data.audioUrl || '',
          hasValidAudio: true,
          collection: {
            name: data.collection || 'Unknown Collection'
          },
          network: data.network || 'ethereum',
          metadata: {
            image: data.image || '',
            animation_url: data.audioUrl || ''
          }
        } as NFT;
      });

      setRecentlyPlayedNFTs(recentPlays);
    } catch (error) {
      console.error('Error fetching recently played:', error);
      // If index error occurs, try fetching without ordering
      if (error instanceof Error && error.toString().includes('index')) {
        try {
          const recentlyPlayedCollection = collection(db, 'nft_plays');
          const fallbackQuery = query(
            recentlyPlayedCollection,
            where('fid', '==', userContext.user.fid),
            limit(8)
          );
          
          const fallbackSnapshot = await getDocs(fallbackQuery);
          const fallbackPlays = fallbackSnapshot.docs.map(doc => {
            const data = doc.data() as NFTPlayData;
            return {
              contract: data.nftContract || '',
              tokenId: data.tokenId || '',
              name: data.name || '',
              image: data.image || '',
              audio: data.audioUrl || '',
              hasValidAudio: true,
              collection: {
                name: data.collection || 'Unknown Collection'
              },
              network: data.network || 'ethereum',
              metadata: {
                image: data.image || '',
                animation_url: data.audioUrl || ''
              }
            } as NFT;
          });
          
          setRecentlyPlayedNFTs(fallbackPlays);
        } catch (fallbackError) {
          console.error('Error with fallback query:', fallbackError);
        }
      }
    }
  }, [userContext?.user?.fid]);

  // Add effect to fetch recently played on mount and when user changes
  useEffect(() => {
    fetchRecentlyPlayed();
  }, [fetchRecentlyPlayed]);

  // Add a type guard function to check if an NFT is grouped
  const isGroupedNFT = (nft: NFT | GroupedNFT): nft is GroupedNFT => {
    return typeof (nft as GroupedNFT).quantity === 'number';
  };

  // Update the handlePlayAudio function to handle both types
  const handlePlayAudio = async (nft: NFT | GroupedNFT) => {
    if (!nft) {
      console.warn('No NFT provided to handlePlayAudio');
      return;
    }

    try {
      const nftId = `${nft.contract}-${nft.tokenId}`;
      console.log('[handlePlayAudio] Starting playback for:', {
        nftId,
        name: nft.name,
        hasAudio: nft.hasValidAudio
      });
      
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

      // Set new NFT as current
      setCurrentlyPlaying(nftId);
      setCurrentPlayingNFT(nft);
      setIsPlayerVisible(true);
      setIsPlayerMinimized(true);
      
      // Get the audio element
      const audio = document.getElementById(`audio-${nftId}`) as HTMLAudioElement;
      if (!audio) {
        throw new Error(`Audio element not found for NFT: ${nftId}`);
      }

      // Track play in database if user is logged in
      if (userContext?.user?.fid) {
        try {
          await logNFTPlay(nft, userContext.user.fid);
          // Refresh recently played list
          await fetchRecentlyPlayed();
        } catch (dbError) {
          console.warn('[handlePlayAudio] Failed to log play:', dbError);
          // Continue playback even if logging fails
        }
      }

      // Start playback
      if (nft.hasValidAudio) {
        setIsPlaying(true);
        await playMedia(audio, videoRef.current, nft);
      } else {
        throw new Error('NFT does not have valid audio');
      }

    } catch (error) {
      // Reset states on error
      setIsPlaying(false);
      setCurrentlyPlaying(null);
      setCurrentPlayingNFT(null);
      
      console.error('[handlePlayAudio] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        nft: {
          contract: nft.contract,
          tokenId: nft.tokenId,
          name: nft.name,
          hasValidAudio: nft.hasValidAudio
        }
      });
      
      setError(error instanceof Error ? error.message : 'Failed to play media');
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

  // Update the handlePlayPause function
  const handlePlayPause = async () => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    const pipVideo = document.pictureInPictureElement as HTMLVideoElement;

    try {
      if (isPlaying) {
        // Pause everything
        if (audio) {
          audio.pause();
          setLastKnownPosition(audio.currentTime);
        }
        if (video) {
          video.pause();
        }
        if (pipVideo && pipVideo !== video) {
          pipVideo.pause();
        }
        setIsPlaying(false);
      } else {
        // Resume everything from the same position
        const currentTime = lastKnownPosition;
        
        if (audio) {
          audio.currentTime = currentTime;
          await audio.play();
        }
        if (video) {
          video.currentTime = currentTime;
          await video.play();
        }
        if (pipVideo && pipVideo !== video) {
          pipVideo.currentTime = currentTime;
          await pipVideo.play();
        }
        
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  };

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

      // Check API keys
      const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!neynarKey || !alchemyKey) {
        throw new Error('Missing API keys');
      }

      // Fetch user profile from Neynar to get wallet addresses
      const profileResponse = await fetchWithRetry(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${userContext.user.fid}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': neynarKey
          }
            }
      );

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const profileData = await profileResponse.json();
      const userData = profileData.users?.[0];

      if (!userData) {
        throw new Error('User data not found');
      }

      console.log('Profile data received:', userData);

      // Collect all ETH addresses
      const allAddresses = new Set<string>();

      // Add custody address if available
      if (userData.custody_address) {
        allAddresses.add(userData.custody_address.toLowerCase());
      }

      // Add verified addresses
      if (userData.verified_addresses?.eth_addresses) {
        userData.verified_addresses.eth_addresses.forEach((addr: string) => {
          allAddresses.add(addr.toLowerCase());
        });
      }

      // Convert to array and filter invalid addresses
      const validAddresses = Array.from(allAddresses).filter(addr => 
        addr && addr.startsWith('0x') && addr.length === 42
      );

      if (validAddresses.length === 0) {
        throw new Error('No valid wallet addresses found');
      }

      console.log('Found wallet addresses:', validAddresses);

      // Process addresses in batches
      const BATCH_SIZE = 2;
      const allNFTs: NFT[] = [];
      
      for (let i = 0; i < validAddresses.length; i += BATCH_SIZE) {
        const batch = validAddresses.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batch);

        const batchPromises = batch.map(async (address) => {
          try {
            const nfts = await fetchNFTsForAddress(address, alchemyKey);
            console.log(`Found ${nfts.length} NFTs for address ${address}`);
            return nfts;
          } catch (error) {
            console.error(`Error fetching NFTs for ${address}:`, error);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const batchNFTs = batchResults.flat();
        
        // Filter duplicates based on contract address and token ID
        const uniqueNFTs = batchNFTs.filter(nft => {
          const key = `${nft.contract}-${nft.tokenId}`;
          const exists = allNFTs.some(existing => 
            `${existing.contract}-${existing.tokenId}` === key
          );
          return !exists;
        });

        allNFTs.push(...uniqueNFTs);

        // Add delay between batches if not the last batch
        if (i + BATCH_SIZE < validAddresses.length) {
          await delay(1000);
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
    setIsExpandButtonVisible(true);
    
    // Clear any existing timeout
    if (expandTimeout) {
      clearTimeout(expandTimeout);
    }
    
    // Set new timeout to hide button after 2 seconds
    const timeout = setTimeout(() => {
      setIsExpandButtonVisible(false);
    }, 2000);
    
    expandTimeout = timeout;
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

  useEffect(() => {
    if (!userContext?.user?.fid) return;

    // Subscribe to real-time updates for recently played NFTs
    const unsubscribe = subscribeToRecentPlays(userContext.user.fid, (plays) => {
      setRecentlyPlayedNFTs(plays);
    });

    // Cleanup subscription when component unmounts
    return () => unsubscribe();
  }, [userContext?.user?.fid]); // Only re-run if fid changes

  // Update the useEffect to load liked NFTs
  useEffect(() => {
    const loadLikedNFTs = async () => {
      if (userContext?.user?.fid) {
        try {
          console.log('Loading liked NFTs for user:', userContext.user.fid);
          const liked = await getLikedNFTs(userContext.user.fid);
          console.log('Loaded liked NFTs:', liked);
          setLikedNFTs(liked);
        } catch (error) {
          console.error('Error loading liked NFTs:', error);
        }
      }
    };

    loadLikedNFTs();
  }, [userContext?.user?.fid]); // Only depend on user FID

  // Update the isNFTLiked helper function to be more robust
  const isNFTLiked = useCallback((nft: NFT) => {
    return likedNFTs.some(
      likedNFT => 
        likedNFT.contract.toLowerCase() === nft.contract.toLowerCase() && 
        likedNFT.tokenId === nft.tokenId
    );
  }, [likedNFTs]);

  // Update handleLikeToggle function
  const handleLikeToggle = async (nft: NFT) => {
    if (!userContext?.user?.fid) {
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
        await removeLikedNFT(userContext.user.fid, nft);
        setLikedNFTs(prev => prev.filter(
        likedNFT => 
            !(likedNFT.contract.toLowerCase() === nft.contract.toLowerCase() && 
            likedNFT.tokenId === nft.tokenId)
        ));
        console.log('NFT removed from likes');
    } else {
        // Add to likes
        await addLikedNFT(userContext.user.fid, nft);
        setLikedNFTs(prev => [...prev, nft]);
        console.log('NFT added to likes');
      }
        } catch (error) {
      console.error('Error toggling like:', error);
      }
    };

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

  // Add this effect to sync video playback with audio state
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
    video.addEventListener('play', () => {
      if (!isPlaying) setIsPlaying(true);
    });
    video.addEventListener('pause', () => {
      if (isPlaying) setIsPlaying(false);
    });

    return () => {
      video.removeEventListener('play', () => {
        if (!isPlaying) setIsPlaying(true);
      });
      video.addEventListener('pause', () => {
        if (isPlaying) setIsPlaying(false);
      });
    };
  }, [isPlaying, currentPlayingNFT]);

  // Add effect for minimized player video sync
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

  // Add this useEffect after other useEffects but before the return statement
  useEffect(() => {
    // Only fetch NFTs when profile page is active and we have a user context
    if (currentPage.isProfile && userContext?.user) {
      console.log('Profile page active, fetching NFTs for user:', userContext.user.fid);
      handleViewProfile();
            }
  }, [currentPage.isProfile, userContext?.user]); // Dependencies: profile page state and user context

  // Public Collection Functions
  const createPublicCollection = async () => {
    if (!userContext?.user?.fid || !newCollectionName.trim()) return;

    try {
      const newCollection = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim(),
        nfts: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, `users/${userContext.user.fid}/public_collections`), newCollection);
      setPublicCollections(prev => [...prev, newCollection]);
      setNewCollectionName('');
      setNewCollectionDescription('');
      setIsEditingCollection(false);
    } catch (error) {
      console.error('Error creating collection:', error);
    }
  };

  const addToPublicCollection = async (nft: NFT, collectionId: string) => {
    if (!userContext?.user?.fid) return;

    try {
      const collectionRef = doc(db, `users/${userContext.user.fid}/public_collections/${collectionId}`);
      await updateDoc(collectionRef, {
        nfts: arrayUnion(nft),
        updatedAt: serverTimestamp()
      });

      setPublicCollections(prev => 
        prev.map(collection => 
          collection.id === collectionId 
            ? { ...collection, nfts: [...collection.nfts, nft] }
            : collection
        )
      );
    } catch (error) {
      console.error('Error adding NFT to collection:', error);
    }
  };

  const removeFromPublicCollection = async (nft: NFT, collectionId: string) => {
    if (!userContext?.user?.fid) return;

    try {
      const collectionRef = doc(db, `users/${userContext.user.fid}/public_collections/${collectionId}`);
      await updateDoc(collectionRef, {
        nfts: arrayRemove(nft),
        updatedAt: serverTimestamp()
      });

      setPublicCollections(prev => 
        prev.map(collection => 
          collection.id === collectionId 
            ? { ...collection, nfts: collection.nfts.filter(n => n.contract !== nft.contract || n.tokenId !== nft.tokenId) }
            : collection
        )
      );
    } catch (error) {
      console.error('Error removing NFT from collection:', error);
    }
  };

  const deletePublicCollection = async (collectionId: string) => {
    if (!userContext?.user?.fid) return;

    try {
      await deleteDoc(doc(db, `users/${userContext.user.fid}/public_collections/${collectionId}`));
      setPublicCollections(prev => prev.filter(collection => collection.id !== collectionId));
    } catch (error) {
      console.error('Error deleting collection:', error);
    }
  };

  // ... rest of the component code ...

  // Add the top played section to the main page
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <RetroStyles />
      
      {/* Top Navigation Bar - Only show when not on Explore page */}
      {!currentPage.isExplore && (
      <div className="fixed top-0 left-0 right-0 bg-black border-b border-green-400/20 h-[64px] z-30">
        <div className="container mx-auto px-4 h-full">
          <div className="flex items-center justify-between h-full">
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center justify-center p-4 cursor-pointer" 
                onClick={() => {
                  setIsSearchPage(true);
                  setSelectedUser(null);
                  setSearchResults([]);
                  setNfts([]);
                  setCurrentPlayingNFT(null);
                  setIsPlaying(false);
                  setIsPlayerVisible(false);
                  setIsPlayerMinimized(false);
                  setCurrentlyPlaying('');
                  setError('');
                  switchPage('isHome');
                }}
              >
                <Image
                  src="/fontlogo.png"
                  alt="PODPLAYR"
                  width={120}
                  height={24}
                  priority={true}
                  className="h-auto"
                />
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
            {/* Recently Played NFTs Section */}
            {recentlyPlayedNFTs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-2 px-2">Recently Played</h2>
                <div className="relative">
                  <div className="overflow-x-auto hide-scrollbar">
                    <div className="flex gap-4 px-2">
                      {groupNFTsByUniqueId(recentlyPlayedNFTs).map((nft) => (
                        <div 
                          key={`${nft.contract}-${nft.tokenId}`}
                          className="flex-shrink-0 w-[100px] group"
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
                            {/* Like Button */}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLikeToggle(nft);
                              }}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-200 hover:scale-110 z-10"
                            >
                              {isNFTLiked(nft) ? (
                                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-red-500">
                                  <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-white hover:text-red-500">
                                  <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                                </svg>
                              )}
                            </button>
                            {/* Play Button */}
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
        
            {/* Top Played NFTs Section */}
            {topPlayedNFTs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-2 px-2">Top Played</h2>
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
                            {/* Like Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
                                handleLikeToggle(nft);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-200 hover:scale-110 z-10"
        >
                              {isNFTLiked(nft) ? (
                                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-red-500">
                                  <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
            </svg>
          ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" className="text-white hover:text-red-500">
                                  <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
                                </svg>
                              )}
                            </button>
                            {/* Play Button */}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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

            {/* Recently Searched Users Section - Show when no search results and not viewing a user */}
            {!searchResults.length && !selectedUser && recentSearches.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-4">Recently Searched</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {recentSearches.slice(0, 6).map((user) => (
                <button
                      key={`${user.fid}`}
                      onClick={() => {
                        const farcasterUser: FarcasterUser = {
                          fid: user.fid,
                          username: user.username,
                          display_name: user.display_name,
                          pfp_url: user.pfp_url,
                          follower_count: 0,
                          following_count: 0
                        };
                        handleUserSelect(farcasterUser);
                      }}
                      className="bg-gray-800/30 backdrop-blur-sm p-4 rounded-lg text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative">
                        <Image
                            src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
                            alt={user.display_name || user.username}
                            className="object-cover"
                            fill
                            sizes="48px"
                          />
                </div>
                        <div>
                          <h3 className="font-mono text-green-400 truncate max-w-[200px]">
                            {user.display_name || user.username}
        </h3>
                          <p className="font-mono text-gray-400 truncate max-w-[200px]">
                            @{user.username}
                          </p>
              </div>
                </div>
                    </button>
                  ))}
              </div>
            </div>
            )}

            {/* Recently Played Section */}
            {recentlyPlayedNFTs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-mono text-green-400 mb-6">Recently Played</h2>
                <div className="relative">
                  <div className="overflow-x-auto pb-4 hide-scrollbar">
                    <div className="flex gap-4">
                      {groupNFTsByUniqueId(recentlyPlayedNFTs).map((nft) => (
                        <div 
                          key={`${nft.contract}-${nft.tokenId}`}
                          className="flex-shrink-0 w-[140px] group"
                        >
                          <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800/20">
                            <NFTImage
                              src={nft.metadata?.image || ''}
                              alt={nft.name}
                              className="w-full h-full object-cover"
                              width={140}
                              height={140}
                              priority={true}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            
                            {/* Play Button */}
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
                        publicCollections={publicCollections}
                        onAddToCollection={addToPublicCollection}
                        onRemoveFromCollection={removeFromPublicCollection}
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
          <div className="max-w-4xl mx-auto">
            {/* Header and Filters */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-mono text-green-400">My Library</h2>
                <div className="flex items-center gap-4">
                  {/* View Toggle */}
                  <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-1">
                    <button
                      onClick={() => setFilterView('list')}
                      className={`p-2 rounded-md transition-colors ${
                        filterView === 'list' ? 'bg-green-400 text-black' : 'text-green-400'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                        <path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm0-240q-33 0-56.5-23.5T280-480q0-33 23.5-56.5T360-560q33 0 56.5 23.5T440-480q0 33-23.5 56.5T360-400Zm0-240q-33 0-56.5-23.5T280-720q0-33 23.5-56.5T360-800q33 0 56.5 23.5T440-720q0 33-23.5 56.5T360-640ZM560-200v-80h320v80H560Zm0-240v-80h320v80H560Zm0-240v-80h320v80H560Z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setFilterView('grid')}
                      className={`p-2 rounded-md transition-colors ${
                        filterView === 'grid' ? 'bg-green-400 text-black' : 'text-green-400'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                        <path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Z"/>
                      </svg>
                    </button>
                  </div>

                  {/* Sort Options */}
                  <select
                    value={filterSort}
                    onChange={(e) => setFilterSort(e.target.value as typeof filterSort)}
                    className="bg-gray-800/50 text-green-400 rounded-lg px-3 py-2 font-mono text-sm border border-green-400/20 focus:outline-none focus:border-green-400"
                  >
                    <option value="recent">Recently Added</option>
                    <option value="name">Name</option>
                    <option value="collection">Collection</option>
                  </select>
                </div>
              </div>

              {/* Search Filter */}
              <div className="relative">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter tracks..."
                  className="w-full px-4 py-3 bg-gray-800/50 border border-green-400/20 rounded-lg text-green-400 placeholder-green-400/50 focus:outline-none focus:border-green-400 font-mono text-sm"
                />
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" 
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-400/50">
                  <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
                </svg>
              </div>
            </div>

            {/* Content */}
            {likedNFTs.length === 0 ? (
              <div className="text-center py-12">
                <p className="font-mono text-gray-400">No liked NFTs yet. Start liking some music!</p>
              </div>
            ) : (
              <>
                {filterView === 'list' ? (
                  <div className="space-y-2">
                    {likedNFTs
                      .filter(nft => 
                        nft.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        nft.collection?.name.toLowerCase().includes(searchFilter.toLowerCase())
                      )
                      .sort((a, b) => {
                        switch (filterSort) {
                          case 'name':
                            return a.name.localeCompare(b.name);
                          case 'collection':
                            return (a.collection?.name || '').localeCompare(b.collection?.name || '');
                          default:
                            return 0;
                        }
                      })
                      .map((nft) => (
                        <div 
                          key={`${nft.contract}-${nft.tokenId}`}
                          className="bg-gray-800/30 rounded-lg p-3 flex items-center gap-4 group hover:bg-gray-800/50 transition-colors"
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
                      <NFTImage 
                              src={nft.metadata?.image || ''}
                              alt={nft.name}
                        className="w-full h-full object-cover"
                              width={48}
                              height={48}
                        priority={true}
                      />
                    </div>

                          {/* Track Info */}
                          <div className="flex-grow min-w-0">
                            <h3 className="font-mono text-green-400 truncate">{nft.name}</h3>
                            <p className="font-mono text-gray-400 text-sm truncate">
                              {nft.collection?.name || 'Unknown Collection'}
                            </p>
    </div>

                          {/* Controls */}
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleLikeToggle(nft)}
                              className="text-red-500 hover:scale-110 transition-transform"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                                <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                              </svg>
                            </button>
                    <button 
                      onClick={() => handlePlayAudio(nft)}
                              className="text-green-400 hover:scale-110 transition-transform"
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

        <audio
          id={`audio-${nft.contract}-${nft.tokenId}`}
          src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
          preload="none"
        />
                        </div>
                      ))}
                      </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {likedNFTs
                      .filter(nft => 
                        nft.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        nft.collection?.name.toLowerCase().includes(searchFilter.toLowerCase())
                      )
                      .sort((a, b) => {
                        switch (filterSort) {
                          case 'name':
                            return a.name.localeCompare(b.name);
                          case 'collection':
                            return (a.collection?.name || '').localeCompare(b.collection?.name || '');
                          default:
                            return 0;
                        }
                      })
                      .map((nft) => (
                        <NFTCard
                          key={`${nft.contract}-${nft.tokenId}`}
                          nft={nft}
                          onPlay={handlePlayAudio}
                          isPlaying={isPlaying}
                          currentlyPlaying={currentlyPlaying}
                          handlePlayPause={handlePlayPause}
                          publicCollections={publicCollections}
                          onAddToCollection={addToPublicCollection}
                          onRemoveFromCollection={removeFromPublicCollection}
                        />
                      ))}
                    </div>
                )}
              </>
            )}
                  </div>
        )}

        {/* Profile Page */}
        {currentPage.isProfile && userContext?.user && (
          <div className="container mx-auto px-4 py-8">
            {/* Profile Header */}
            <div className="mb-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-800">
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

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <p className="font-mono text-gray-400 text-sm mb-1">Total NFTs</p>
                  <p className="font-mono text-green-400 text-xl">{nfts.length}</p>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <p className="font-mono text-gray-400 text-sm mb-1">Audio NFTs</p>
                  <p className="font-mono text-green-400 text-xl">
                    {nfts.filter(nft => nft.hasValidAudio).length}
                  </p>
                </div>
              </div>
            </div>

            {/* NFT Grid */}
            <div className="mb-8">
              <div className="relative">
                <div className="overflow-x-auto pb-4 hide-scrollbar">
                  <div className="flex gap-4">
                    {isLoadingNFTs ? (
                      <div className="flex-shrink-0 w-full flex flex-col items-center justify-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-4"></div>
                        <p className="font-mono text-green-400">Loading your NFTs...</p>
                      </div>
                    ) : nfts.length === 0 ? (
                      <div className="flex-shrink-0 w-full text-center py-12">
                        <p className="font-mono text-gray-400">No audio NFTs found in your collection</p>
                        <p className="font-mono text-gray-400 text-sm mt-2">
                          Make sure your wallet is connected and contains audio NFTs
                        </p>
                      </div>
                    ) : (
                      groupNFTsByUniqueId(nfts.filter(nft => nft.hasValidAudio)).map((nft) => {
                        let cleanTokenId = nft.tokenId;
                        if (nft.metadata?.animation_url) {
                          const animationMatch = nft.metadata.animation_url.match(/\/(\d+)\./);
                          if (animationMatch) {
                            cleanTokenId = animationMatch[1];
                          }
                        }
                        if (!cleanTokenId) {
                          cleanTokenId = `0x${nft.contract.slice(0, 10)}`;
                        }
                        const uniqueKey = `${nft.contract.toLowerCase()}-${cleanTokenId}`;
                        
                        return (
                          <div key={uniqueKey} className="flex-shrink-0 w-[200px]">
                            <NFTCard
                              nft={nft}
                              onPlay={handlePlayAudio}
                              isPlaying={isPlaying}
                              currentlyPlaying={currentlyPlaying}
                              handlePlayPause={handlePlayPause}
                              publicCollections={publicCollections}
                              onAddToCollection={addToPublicCollection}
                              onRemoveFromCollection={removeFromPublicCollection}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media Player - Minimized Mode */}
      {currentPlayingNFT && (
        <div className="fixed bottom-[64px] left-0 right-0 bg-black border-t border-green-400/20 h-20 z-30">
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
                              src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || '')}
                              className="w-full h-full object-cover"
                              playsInline
                              loop={false}
                              muted={true}
                              controls={false}
                      onPlay={() => {
                        if (!isPlaying) setIsPlaying(true);
                      }}
                      onPause={() => {
                        if (isPlaying) setIsPlaying(false);
                      }}
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
                          <h4 className="font-mono text-green-400 truncate text-sm">
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
                      className="text-green-400 hover:text-green-300"
                    >
                      {isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                          <path d="M560-200v-560h80v560H560Zm-320 0v-560h80v560H240Z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                          <path d="M320-200v-560l440 280-440 280Z"/>
                        </svg>
      )}
                    </button>

                {/* Expand Button - Only in minimized player */}
                <button
                  onClick={() => setIsPlayerMinimized(false)}
                  className="text-green-400 hover:text-green-300"
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
          <div className="p-4 flex items-center justify-between border-b border-green-400/20">
                  <button
                    onClick={() => setIsPlayerMinimized(true)}
              className="text-green-400 hover:text-green-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="m336-280-56-56 184-184-184-184 56-56 240 240-240 240Z"/>
                    </svg>
                  </button>
            <h3 className="font-mono text-green-400">Now Playing</h3>
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
                            src={processMediaUrl(currentPlayingNFT.metadata?.animation_url || '')}
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
                    <svg xmlns="http://www.w3.org/2000/svg" height="64px" viewBox="0 -960 960 960" width="64px" fill="currentColor" className="text-white">
                      <path d="M320-200v-560l440 280-440 280Z"/>
                    </svg>
                      </div>
                </div>
                </div>

              {/* Track Info */}
              <div className="text-center mb-12">
                <h2 className="font-mono text-green-400 text-xl mb-3">{currentPlayingNFT.name}</h2>
                <p className="font-mono text-gray-400">{currentPlayingNFT.collection?.name}</p>
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
                    className="h-full bg-green-400 rounded-full"
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
                      const currentIndex = nfts.findIndex(nft => 
                        nft.contract === currentPlayingNFT.contract && 
                        nft.tokenId === currentPlayingNFT.tokenId
  );
                      if (currentIndex > 0) {
                        handlePlayAudio(nfts[currentIndex - 1]);
                      }
                    }}
                    className="text-white hover:scale-110 transition-transform"
                    disabled={!nfts.length}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
                      <path d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Z"/>
                        </svg>
                      </button>

                  {/* Play/Pause Button */}
                      <button
                        onClick={handlePlayPause}
                    className="w-20 h-20 rounded-full bg-green-400 text-black flex items-center justify-center hover:scale-105 transition-transform"
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
                      const currentIndex = nfts.findIndex(nft => 
                        nft.contract === currentPlayingNFT.contract && 
                        nft.tokenId === currentPlayingNFT.tokenId
  );
                      if (currentIndex < nfts.length - 1) {
                        handlePlayAudio(nfts[currentIndex + 1]);
                      }
                    }}
                    className="text-white hover:scale-110 transition-transform"
                    disabled={!nfts.length}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="currentColor">
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
                    {isNFTLiked(currentPlayingNFT) ? (
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-green-400/20 h-16 z-20 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="container mx-auto h-full">
          <div className="grid grid-cols-4 h-full items-center">
            {/* Home Button */}
            <button 
              onClick={() => switchPage('isHome')}
              className={`flex flex-col items-center gap-1 transition-colors mb-2 ${
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
              className={`flex flex-col items-center gap-1 transition-colors mb-2 ${
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
              className={`flex flex-col items-center gap-1 transition-colors mb-2 ${
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
                className={`flex flex-col items-center gap-1 transition-colors mb-2 ${
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


//