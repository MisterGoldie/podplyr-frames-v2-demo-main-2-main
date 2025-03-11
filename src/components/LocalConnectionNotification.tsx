import React, { useEffect, useState } from 'react';

interface LocalConnectionNotificationProps {
  selectedUser: any;
  nfts: any[];
  isLoadingNFTs: boolean;
  isNFTLiked: (nft: any, skipAnimation?: boolean) => boolean;
}

const LocalConnectionNotification: React.FC<LocalConnectionNotificationProps> = ({
  selectedUser,
  nfts,
  isLoadingNFTs,
  isNFTLiked
}) => {
  // Local state for this component only
  const [showNotification, setShowNotification] = useState(false);
  const [username, setUsername] = useState('');
  const [likedCount, setLikedCount] = useState(0);
  
  // Reset notification when user or loading state changes
  useEffect(() => {
    console.log('🔴 USER OR LOADING CHANGED - resetting notification');
    setShowNotification(false);
  }, [selectedUser, isLoadingNFTs]);
  
  // Check for connections only after everything is fully loaded
  useEffect(() => {
    // Safety check - don't proceed unless everything is ready
    if (!selectedUser || !isNFTLiked || isLoadingNFTs || nfts.length === 0) {
      setShowNotification(false);
      return;
    }
    
    console.log(`🔍 Checking for liked NFTs from ${selectedUser.username} now that loading is complete`);
    
    // Count liked NFTs
    let count = 0;
    for (const nft of nfts) {
      if (isNFTLiked(nft, true)) {
        count++;
      }
    }
    
    console.log(`📊 Found ${count} liked NFTs for ${selectedUser.username}`);
    
    // Only show notification if there are liked NFTs
    if (count > 0) {
      console.log(`💜 SHOWING connection for ${selectedUser.username} with ${count} liked NFTs`);
      setUsername(selectedUser.username);
      setLikedCount(count);
      setShowNotification(true);
    } else {
      console.log(`❌ NO connection for ${selectedUser.username} - hiding notification`);
      setShowNotification(false);
    }
  }, [selectedUser, nfts, isNFTLiked, isLoadingNFTs]);
  
  // Don't render anything if we shouldn't show the notification
  if (!showNotification || !selectedUser || isLoadingNFTs || nfts.length === 0 || likedCount === 0) {
    return null;
  }
  
  // Render the notification
  return (
    <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-center z-50 bg-purple-600 border-b border-purple-700">
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="flex items-center justify-center max-w-full px-4">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-white text-lg flex items-center flex-shrink-0 overflow-visible">
            <span className="flex-shrink-0">Connection with</span>
            <span className="font-semibold ml-2 whitespace-nowrap overflow-visible">
              {username} (×{likedCount})
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default LocalConnectionNotification;
