import React from 'react';
import { useConnection } from '../context/ConnectionContext';

// No props needed since we're using context
interface ConnectionHeaderProps {}

/**
 * A dedicated header component for showing connection notifications
 * This is completely separate from the regular notification system
 * and will stay visible as long as the user is viewing the connected wallet
 */
const ConnectionHeader: React.FC<ConnectionHeaderProps> = () => {
  // Get connection data from context
  const { connectionUsername, connectionLikedCount, showConnectionHeader } = useConnection();
  
  // Format the display name with the like count
  const displayName = connectionLikedCount > 0 
    ? `${connectionUsername} (×${connectionLikedCount})` 
    : connectionUsername;
    
  // STRICT validation: Don't render if ANY conditions fail
  // 1. Don't show if the flag is off
  // 2. Don't show if no username
  // 3. Don't show if liked count is 0
  // This creates a failsafe that prevents incorrect displays
  if (!showConnectionHeader || !connectionUsername || connectionLikedCount <= 0) {
    console.log('🛡 ConnectionHeader failsafe prevented display', {
      showConnectionHeader,
      connectionUsername,
      connectionLikedCount
    });
    return null;
  }
  
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
              {displayName}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default ConnectionHeader;
