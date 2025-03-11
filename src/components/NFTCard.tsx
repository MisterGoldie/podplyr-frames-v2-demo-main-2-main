import React, { memo } from 'react';

// Add proper types
interface NFTCardProps {
  nft: NFT;
  isLiked: boolean;
  // other props...
}

// Use memo to prevent unnecessary re-renders
const NFTCard: React.FC<NFTCardProps> = memo(({ 
  nft, 
  isLiked,
  // other props... 
}) => {
  // Remove console.log in production
  if (process.env.NODE_ENV !== 'production') {
    // Only log when liked status changes
    React.useEffect(() => {
      console.log(`NFT "${nft.name}" liked status from prop: ${isLiked}`);
    }, [nft.name, isLiked]);
  }
  
  // Rest of component...
  
  return (
    // Your JSX here
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these specific props change
  return (
    prevProps.nft.id === nextProps.nft.id &&
    prevProps.isLiked === nextProps.isLiked &&
    prevProps.isPlaying === nextProps.isPlaying
  );
});

export default NFTCard; 