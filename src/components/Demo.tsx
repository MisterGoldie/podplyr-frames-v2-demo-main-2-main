"use client";

import Image from 'next/image';
import { useEffect, useCallback, useState, useMemo, useRef, ReactEventHandler, SyntheticEvent } from "react";
import sdk from "@farcaster/frame-sdk";
import AudioVisualizer from './AudioVisualizer';
import { debounce } from 'lodash';


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
          })).slice(0, 3); // Limit to 3 suggestions
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
    setUsername(selectedUsername);
    onSearch(selectedUsername);
    setSuggestions([]); // Clear suggestions after selection
  };
  

  return (
    <div className="relative w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Farcaster username..."
            className="w-full px-4 py-3 rounded-lg text-black placeholder-gray-500 bg-white"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching}
            className="w-32 mx-auto px-6 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {suggestions.length > 0 && (
        <div className="absolute w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-80 overflow-y-auto z-10">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.fid}
              onClick={() => handleSuggestionClick(suggestion.username)}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-100 text-left"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                <Image
                  src={suggestion.pfp_url || `https://avatar.vercel.sh/${suggestion.username}`}
                  alt={suggestion.display_name || suggestion.username || 'User avatar'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://avatar.vercel.sh/${suggestion.username}`;
                  }}
                  width={40}
                  height={40}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900">{suggestion.display_name || suggestion.username}</div>
                <div className="text-sm text-gray-600">@{suggestion.username}</div>
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
        <div className="w-16 h-16 rounded-full overflow-hidden">
          <Image
            src={user.pfp_url || `https://avatar.vercel.sh/${user.username}`}
            alt={user.display_name || user.username}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = `https://avatar.vercel.sh/${user.username}`;
            }}
            width={64}
            height={64}
          />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{user.display_name || user.username}</h3>
          <p className="text-gray-600">@{user.username}</p>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            <span>{user.follower_count.toLocaleString()} followers</span>
            <span>{user.following_count.toLocaleString()} following</span>
          </div>
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
    background: linear-gradient(45deg, #2a2a2a, #1a1a1a);
    border: 2px solid #444;
    border-radius: 10px;
    box-shadow: 
      inset 0 0 20px rgba(0,0,0,0.5),
      0 2px 8px rgba(0,0,0,0.3);
    transition: transform 0.3s ease-in-out;
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

// Add type declaration for model-viewer
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const mediaUrl = useMemo(() => {
    if (!url) return null;
    return processMediaUrl(url);
  }, [url]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.warn('Video error:', e);
    setError(true);
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
        muted
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

// Update the image component to handle IPFS gateway failures
const NFTImage = ({ src, alt, className }: { src: string, alt: string, className?: string }) => {
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [error, setError] = useState(false);

  const imageUrl = useMemo(() => {
    if (!src) return null;
    if (src.includes('/ipfs/')) {
      const hash = src.split('/ipfs/')[1];
      return `${IPFS_GATEWAYS[currentGatewayIndex]}${hash}`;
    }
    return src;
  }, [src, currentGatewayIndex]);

  const handleError = () => {
    console.log('Image load error:', imageUrl);
    if (currentGatewayIndex < IPFS_GATEWAYS.length - 1) {
      setCurrentGatewayIndex(prev => prev + 1);
    } else {
      setError(true);
    }
  };

  if (error || !imageUrl) {
    return (
      <div className={`${className} bg-gray-800 flex items-center justify-center`}>
        <span className="text-xs text-gray-400">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      className={className}
      onError={handleError}
      width={400}
      height={400}
      unoptimized
    />
  );
};

export default function Demo({ title }: { title?: string }) {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FarcasterUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<FarcasterUser | null>(null);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [currentPlayingNFT, setCurrentPlayingNFT] = useState<NFT | null>(null);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(true);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [loadedAudioElements, setLoadedAudioElements] = useState<Set<string>>(new Set());
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearchPage, setIsSearchPage] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMobile] = useState(() => window.innerWidth < 768);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [mediaLoadProgress, setMediaLoadProgress] = useState(0);
  const [preloadedMedia, setPreloadedMedia] = useState<Set<string>>(new Set());

  // Add near the top of Demo component with other state declarations
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
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioProgress(time);
    }
  };

  useEffect(() => {
    const load = async () => {
      sdk.actions.ready();
    };
    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
      load();
    }
  }, [isSDKLoaded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setAudioProgress(audio.currentTime);
    };

    const updateDuration = () => {
      setAudioDuration(audio.duration);
    };

    const handleEnded = () => {
      setCurrentlyPlaying(null);
      setAudioProgress(0);
      setAudioDuration(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentPlayingNFT]);

  const handlePlayAudio = async (nft: NFT) => {
    const nftId = `${nft.contract}-${nft.tokenId}`;
    const audioId = `audio-${nftId}`;
    let audioElement = document.getElementById(audioId) as HTMLAudioElement;
    const video = videoRef.current;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    try {
      if (!audioElement || !nft.hasValidAudio) return;

      // If this is the currently playing NFT
      if (currentlyPlaying === nftId) {
        if (!audioElement.paused) {
          audioElement.pause();
          if (video) video.pause();
          setIsPlaying(false);
        } else {
          setIsPlayerMinimized(false);
          await playMedia(audioElement, video, nft);
        }
        return;
      }

      // Stop current playback
      if (currentlyPlaying) {
        const currentAudio = document.getElementById(`audio-${currentlyPlaying}`) as HTMLAudioElement;
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      }

      // Update UI states
      setIsPlayerVisible(true);
      setIsPlayerMinimized(false);
      setCurrentlyPlaying(nftId);
      setCurrentPlayingNFT(nft);

      await playMedia(audioElement, video, nft);

    } catch (error) {
      console.warn('Playback error:', error);
      resetPlaybackStates();
    }
  };

  const playMedia = async (audio: HTMLAudioElement, video: HTMLVideoElement | null, nft: NFT) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      setIsMediaLoading(true);
      
      // Start audio playback
      await audio.play();
      setIsPlaying(true);

      // Handle video if present
      if (video && nft.metadata?.animation_url) {
        // Mobile optimizations
        if (isMobile) {
          video.playsInline = true;
          video.preload = 'metadata';
          video.autoplay = false;
          
          // Reduce video quality for mobile
          if (video.videoHeight > 720) {
            video.style.maxHeight = '720px';
          }
          
          // Get the processed URL
          const videoUrl = processMediaUrl(nft.metadata.animation_url);
          if (!videoUrl) {
            console.warn('Invalid video URL');
            return;
          }
          
          // Load video in chunks for mobile
          const mediaSource = new MediaSource();
          video.src = URL.createObjectURL(mediaSource);
          
          mediaSource.addEventListener('sourceopen', async () => {
            try {
              const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
              
              // Fetch video in chunks
              const response = await fetch(videoUrl);
              if (!response.ok) throw new Error('Video fetch failed');
              
              const reader = response.body?.getReader();
              if (!reader) throw new Error('Unable to read video stream');
              
              while(true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                // Wait for previous chunk to be processed
                if (!sourceBuffer.updating) {
                  sourceBuffer.appendBuffer(value);
                  await new Promise(resolve => {
                    sourceBuffer.addEventListener('updateend', resolve, { once: true });
                  });
                }
              }
              mediaSource.endOfStream();
            } catch (error) {
              console.warn('Video loading failed:', error);
            }
          });
        }
        
        video.currentTime = audio.currentTime;
        await video.play().catch(console.warn);
      }
      
      setIsMediaLoading(false);
    } catch (error) {
      console.warn('Media playback failed:', error);
      setIsMediaLoading(false);
      throw error;
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
    setIsSearchPage(false);
    console.log('=== START NFT FETCH ===');
    setIsLoadingNFTs(true);
    setError(null);
    setNfts([]);

    try {
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
    setAudioDuration(0); // Reset duration
    setIsPlaying(false); // Ensure playing state is reset
  };

  useEffect(() => {
    if (!currentPlayingNFT) return;
    
    const audioElement = document.getElementById(`audio-${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`) as HTMLAudioElement;
    
    if (!audioElement) return;

    // Set initial duration when metadata is loaded
    const handleLoadedMetadata = () => {
      setAudioDuration(audioElement.duration);
    };

    // Update progress as audio plays
    const handleTimeUpdate = () => {
      setAudioProgress(audioElement.currentTime);
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    // Set initial values if already loaded
    if (audioElement.duration) {
      setAudioDuration(audioElement.duration);
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
      const nftsData = await fetchNFTs(user.fid); // Make sure fetchNFTs returns Promise<NFT[]>
      if (nftsData && Array.isArray(nftsData)) {
        cacheNFTs(user.fid, nftsData);
        setNfts(nftsData);
      }
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      setError('Failed to fetch NFTs');
    } finally {
      setIsLoadingNFTs(false);
    }
  };

  // Modify the video sync effect
  useEffect(() => {
    const video = videoRef.current;
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    
    if (!video || !audio) return;

    // Don't sync video on mobile when minimized
    if (isMobile && isPlayerMinimized) {
      video.pause();
      return;
    }

    const syncVideoWithAudio = async () => {
      try {
        video.currentTime = audio.currentTime;
        if (!audio.paused && !isPlayerMinimized) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Video sync error:', error);
        }
      }
    };

    // Reduce event listener frequency on mobile
    const handleAudioTimeUpdate = debounce(() => {
      if (!isPlayerMinimized) {
        syncVideoWithAudio();
      }
    }, isMobile ? 250 : 0);

    audio.addEventListener('play', syncVideoWithAudio);
    audio.addEventListener('pause', () => video.pause());
    audio.addEventListener('timeupdate', handleAudioTimeUpdate);
    audio.addEventListener('seeking', syncVideoWithAudio);

    return () => {
      audio.removeEventListener('play', syncVideoWithAudio);
      audio.removeEventListener('pause', () => video.pause());
      audio.removeEventListener('timeupdate', handleAudioTimeUpdate);
      audio.removeEventListener('seeking', syncVideoWithAudio);
      handleAudioTimeUpdate.cancel();
    };
  }, [currentPlayingNFT, isPlayerMinimized, isMobile]);

  // Add this function near your other handlers
  const handleSeekOffset = (offsetSeconds: number) => {
    const audio = document.getElementById(`audio-${currentPlayingNFT?.contract}-${currentPlayingNFT?.tokenId}`) as HTMLAudioElement;
    const video = videoRef.current;
    
    if (audio) {
      const newTime = Math.min(Math.max(0, audio.currentTime + offsetSeconds), audio.duration);
      audio.currentTime = newTime;
      if (video) {
        video.currentTime = newTime;
      }
    }
  };

  const preloadNFTMedia = async (nft: NFT) => {
    const nftId = `${nft.contract}-${nft.tokenId}`;
    
    if (preloadedMedia.has(nftId)) return;

    setIsMediaLoading(true);
    setMediaLoadProgress(0);

    try {
      // Preload audio
      if (nft.audio || nft.metadata?.animation_url) {
        const audioUrl = processMediaUrl(nft.audio || nft.metadata?.animation_url || '');
        if (audioUrl) {
          const audio = new Audio();
          audio.preload = "auto"; // Force preload
          audio.src = audioUrl;
          
          await new Promise((resolve, reject) => {
            audio.addEventListener('loadeddata', resolve, { once: true });
            audio.addEventListener('error', reject, { once: true });
            audio.addEventListener('progress', (e) => {
              if (audio.duration) {
                const progress = (audio.buffered.end(0) / audio.duration) * 100;
                setMediaLoadProgress(progress);
              }
            });
          });
        }
      }

      // Preload video if exists
      if (nft.metadata?.animation_url) {
        const videoUrl = processMediaUrl(nft.metadata.animation_url);
        if (videoUrl) {
          const video = document.createElement('video');
          video.preload = "auto"; // Force preload
          video.src = videoUrl;
          
          await new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', resolve, { once: true });
            video.addEventListener('error', reject, { once: true });
          });
        }
      }

      setPreloadedMedia(prev => new Set(prev).add(nftId));
    } catch (error) {
      console.error('Error preloading media:', error);
    } finally {
      setIsMediaLoading(false);
      setMediaLoadProgress(0);
    }
  };

  function handleVideoError(event: SyntheticEvent<HTMLVideoElement, Event>): void {
    throw new Error('Function not implemented.');
  }

  function setLoaded(arg0: boolean): void {
    throw new Error('Function not implemented.');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      <RetroStyles />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-12 text-center text-green-400 font-mono tracking-wider retro-display p-4">
          PODPLAYR
        </h1>

        <div className="retro-container p-6 mb-8">
          <SearchBar onSearch={handleSearch} isSearching={isSearching} />
        </div>

        {error && (
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
                      <h3 className="font-mono text-green-400">
                        {user.display_name || user.username}
                      </h3>
                      <p className="font-mono text-gray-400">@{user.username}</p>
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
                onClick={() => {
                  setSelectedUser(null);
                  setNfts([]);
                  setSearchResults([]);
                  handleBackToSearch();
                }}
                className="retro-button p-2 text-green-400"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="flex items-center gap-4">
                {selectedUser.pfp_url ? (
                  <Image
                    src={selectedUser.pfp_url}
                    alt={selectedUser.display_name || selectedUser.username || 'User avatar'}
                    className="w-16 h-16 rounded-full border-2 border-gray-600"
                    width={64}
                    height={64}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-green-400 font-mono text-xl">
                    {(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-mono text-green-400">
                    {selectedUser.display_name || selectedUser.username}
                  </h2>
                  <p className="font-mono text-gray-400">@{selectedUser.username}</p>
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
                        src={processMediaUrl(nft.image || nft.metadata?.image || nft.metadata?.image_url || '') || ''}
                        alt={nft.name}
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
                          muted
                          controls={false}
                          preload="none"
                          onError={handleVideoError}
                          onLoadedData={() => setLoaded(true)}
                        />
                        {!isPlaying && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}

                    <button 
                      onClick={() => handlePlayAudio(nft)}
                      className="absolute bottom-4 right-4 retro-button p-3 text-white"
                    >
                      {currentlyPlaying === `${nft.contract}-${nft.tokenId}` && isPlaying ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="retro-display p-2">
                      <div className="marquee-container">
                        <div className={`text-lg text-green-400 ${
                          nft.name.length > 20 ? 'marquee-content' : ''
                        }`}>
                          {nft.name}
                        </div>
                      </div>
                    </div>
                  </div>
                  {nft.hasValidAudio && (
                    <audio
                      id={`audio-${nft.contract}-${nft.tokenId}`}
                      data-nft={`${nft.contract}-${nft.tokenId}`}
                      preload="auto"
                      crossOrigin="anonymous"
                      onLoadedMetadata={(e) => {
                        const audio = e.target as HTMLAudioElement;
                        console.log('Audio loaded:', nft.name, 'Duration:', audio.duration);
                        setAudioDuration(audio.duration);
                        setLoadedAudioElements(prev => new Set(prev).add(`${nft.contract}-${nft.tokenId}`));
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLAudioElement;
                        console.error('Audio error:', {
                          error: e,
                          src: target.src,
                          currentTime: target.currentTime,
                          readyState: target.readyState
                        });
                        target.remove();
                        setLoadedAudioElements(prev => {
                          const next = new Set(prev);
                          next.delete(`${nft.contract}-${nft.tokenId}`);
                          return next;
                        });
                        if (currentlyPlaying === `${nft.contract}-${nft.tokenId}`) {
                          setCurrentlyPlaying(null);
                          setCurrentPlayingNFT(null);
                          setIsPlaying(false);
                        }
                      }}
                    >
                      <source 
                        src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                        type="audio/mpeg" 
                      />
                      <source 
                        src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                        type="audio/mp4" 
                      />
                      <source 
                        src={processMediaUrl(nft.audio || nft.metadata?.animation_url || '')}
                        type="audio/wav" 
                      />
                    </audio>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Update the media player to look like a Walkman/cassette player */}
        <div 
          className={`fixed bottom-0 left-0 right-0 retro-container transition-all duration-300 z-50 bg-gray-900/95 backdrop-blur-sm ${
            isPlayerMinimized ? 'h-16' : 'h-96'
          } ${isPlayerVisible ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <div className="container mx-auto px-2 h-full">
            <div className="flex flex-col h-full">
              {/* Main player row with 3 columns */}
              <div className="flex items-center justify-between gap-2 h-16">
                {/* Left play button */}
                {currentPlayingNFT && (
                  <button
                    onClick={() => handlePlayAudio(currentPlayingNFT)}
                    className="retro-button p-2 text-green-400"
                    disabled={!loadedAudioElements.has(`${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`)}
                  >
                    {!loadedAudioElements.has(`${currentPlayingNFT.contract}-${currentPlayingNFT.tokenId}`) ? (
                      <div className="relative">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-400"></div>
                        {isMediaLoading && (
                          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs text-green-400">
                            {Math.round(mediaLoadProgress)}%
                          </div>
                        )}
                      </div>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10h6v4H9z" />
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
                  className="retro-button p-1 text-green-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                      d={isPlayerMinimized ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} 
                    />
                  </svg>
                </button>
              </div>

              {/* Progress bar section - only shown when not minimized */}
              {!isPlayerMinimized && currentPlayingNFT && (
                <div className="flex flex-col gap-4 py-2">
                  {/* NFT Media Display */}
                  <div className="flex justify-center">
                    <div className="w-48 h-48 relative rounded-lg overflow-hidden">
                      {currentPlayingNFT.metadata?.animation_url ? (
                        <div className="w-full h-full relative">
                          <video 
                            ref={videoRef}
                            src={processMediaUrl(currentPlayingNFT.metadata.animation_url)}
                            className="w-full h-full object-cover"
                            playsInline
                            loop={false}
                            muted
                            controls={false}
                            preload="none"
                            onError={handleVideoError}
                            onLoadedData={() => setLoaded(true)}
                          />
                          {!isPlaying && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Image
                          src={processMediaUrl(currentPlayingNFT.image || '') || '/placeholder.jpg'}
                          alt={currentPlayingNFT.name}
                          className="w-full h-full object-cover"
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
                    
                    {/* Add Rewind Button */}
                    <button
                      onClick={() => handleSeekOffset(-10)}
                      className="retro-button p-1 text-green-400"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                      </svg>
                    </button>
                    
                    <div className="flex-1 relative">
                      <input
                        type="range"
                        min={0}
                        max={audioDuration || 100}
                        value={audioProgress}
                        onChange={(e) => handleSeek(Number(e.target.value))}
                        className="retro-progress w-full"
                        style={{
                          background: `linear-gradient(to right, #4ade80 ${(audioProgress / (audioDuration || 1)) * 100}%, #1f2937 ${(audioProgress / (audioDuration || 1)) * 100}%)`
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
                    
                    {/* Add Fast Forward Button */}
                    <button
                      onClick={() => handleSeekOffset(10)}
                      className="retro-button p-1 text-green-400"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                      </svg>
                    </button>
                    
                    <span className="font-mono text-green-400 text-base min-w-[40px]">
                      {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchNFTs(fid: number): Promise<NFT[]> {
  // Your NFT fetching logic here
  // Make sure to return an array of NFTs
  return [];  // Replace with actual NFT fetching logic
}

function resetPlaybackStates() {
  throw new Error('Function not implemented.');
}