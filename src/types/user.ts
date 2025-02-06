export interface FarcasterUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  follower_count: number;
  following_count: number;
  profile?: {
    bio?: string;
    location?: string;
  };
  verifiedAddresses?: string[];
}

export interface SearchedUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
  bio?: string;
  address?: string;
  timestamp?: number;
}

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  uri?: string;
  properties?: {
    files?: NFTFile[];
    category?: string;
  };
}

export interface NFTFile {
  uri?: string;
  url?: string;
  type?: string;
  mimeType?: string;
  name?: string;
}

export interface NFTMedia {
  gateway?: string;
  raw?: string;
  format?: string;
  bytes?: number;
}

export interface NFTPlayData {
  nftContract: string;
  tokenId: string;
  name: string;
  description?: string;
  image: string;
  audioUrl: string;
  collection: string;
  network?: string;
  timestamp?: number;
}

export interface NFT {
  contract: string;
  tokenId: string;
  name: string;
  description?: string;
  audio?: string;
  isVideo?: boolean;
  isAnimation?: boolean;
  hasValidAudio?: boolean;
  image: string;
  metadata?: {
    name?: string;
    description?: string;
    image?: string;
    animation_url?: string;
    attributes?: Array<{
      trait_type: string;
      value: string | number;
    }>;
  };
  collection?: {
    name: string;
    image?: string;
  };
  network?: 'ethereum' | 'base';
  playTracked?: boolean;
  quantity?: number;
}

export interface ExtendedFrameContext {
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

export interface PublicCollection {
  id: string;
  name: string;
  description?: string;
  nfts: NFT[];
  createdAt: any;
  updatedAt: any;
}

export interface LibraryViewProps {
  likedNFTs: NFT[];
  handlePlayAudio: (nft: NFT) => Promise<void>;
  currentlyPlaying: string | null;
  isPlaying: boolean;
  handlePlayPause: () => void;
}

export interface ProfileViewProps {
  userContext: UserContext;
  nfts: NFT[];
  handlePlayAudio: (nft: NFT) => Promise<void>;
  isPlaying: boolean;
  currentlyPlaying: string | null;
  handlePlayPause: () => void;
}

export interface UserContext {
  fid?: number;
  username?: string;
  address?: string;
  displayName?: string;
  avatar?: string;
  isAuthenticated?: boolean;
}

export interface PageState {
  isHome: boolean;
  isExplore: boolean;
  isLibrary: boolean;
  isProfile: boolean;
}