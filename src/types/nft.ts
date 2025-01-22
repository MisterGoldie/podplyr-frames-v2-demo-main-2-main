interface NFT {
  network: 'ethereum' | 'base';
  contract: string;
  tokenId: string;
  metadata?: {
    animation_url?: string;
    audio_url?: string;  // Add this if you're supporting multiple audio source fields
    name?: string;
    image?: string;
    // ... other metadata fields
  };
  // ... rest of your NFT interface
} 