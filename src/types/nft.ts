interface NFT {
  contract: string;
  tokenId: string;
  name: string;
  image?: string;
  audio?: string;
  hasValidAudio?: boolean;
  network?: 'ethereum' | 'base';
  metadata?: {
    animation_url?: string;
    audio_url?: string;
    name?: string;
    image?: string;
    tokenId?: string;
  };
} 