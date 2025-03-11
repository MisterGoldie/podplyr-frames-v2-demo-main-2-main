import React, { createContext, useContext, useState, ReactNode } from 'react';
import { NFT } from '../types/user';

type NotificationType = 'like' | 'unlike' | 'connection';

interface NFTNotificationContextType {
  showNotification: (type: NotificationType, nft: NFT) => void;
  showConnectionNotification: (username: string, likedCount?: number) => void;
  hideNotification: () => void;
  isVisible: boolean;
  notificationType: NotificationType | null;
  nftName: string;
}

const NFTNotificationContext = createContext<NFTNotificationContextType | undefined>(undefined);

export const useNFTNotification = () => {
  const context = useContext(NFTNotificationContext);
  if (!context) {
    throw new Error('useNFTNotification must be used within an NFTNotificationProvider');
  }
  return context;
};

interface NFTNotificationProviderProps {
  children: ReactNode;
}

export const NFTNotificationProvider: React.FC<NFTNotificationProviderProps> = ({ children }) => {
  // Initialize with explicitly false visibility and null type to prevent showing on startup
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [notificationType, setNotificationType] = useState<NotificationType | null>(null);
  const [nftName, setNftName] = useState<string>('');
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showNotification = (type: NotificationType, nft: NFT) => {
    console.log('🔔 Showing notification:', { type, nftName: nft.name });
    
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }

    // Set notification data
    setNotificationType(type);
    setNftName(nft.name || 'NFT');
    
    // Show notification immediately
    setIsVisible(true);
    console.log('🚨🚨 NOTIFICATION VISIBLE NOW:', { type, name: nft.name });
  };
  
  // New function to show connection notifications with optional liked count
  const showConnectionNotification = (username: string, likedCount?: number) => {
    const displayName = likedCount ? `${username} (×${likedCount})` : username;
    console.log('💜 Showing CONNECTION notification for:', displayName);
    
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }

    // Set notification data
    setNotificationType('connection');
    setNftName(displayName); // Use the formatted username as the highlight text
    
    // Show notification immediately
    setIsVisible(true);
    console.log('🚨🚨 CONNECTION NOTIFICATION VISIBLE NOW for:', displayName);

    // Auto-hide after 4 seconds
    const id = setTimeout(() => {
      console.log('🔔❌ Auto-hiding notification');
      setIsVisible(false);
    }, 4000);
    
    setTimeoutId(id);
  };

  const hideNotification = () => {
    setIsVisible(false);
  };

  return (
    <NFTNotificationContext.Provider
      value={{
        showNotification,
        showConnectionNotification,
        hideNotification,
        isVisible,
        notificationType,
        nftName
      }}
    >
      {children}
    </NFTNotificationContext.Provider>
  );
};
