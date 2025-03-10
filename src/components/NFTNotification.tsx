import React, { useEffect, useState } from 'react';
import NotificationHeader from './NotificationHeader';
import { useNFTNotification } from '../context/NFTNotificationContext';

// Simple animation for notifications only

interface NFTNotificationProps {
  onReset?: () => void;
}

const NFTNotification: React.FC<NFTNotificationProps> = ({ onReset }) => {
  const { isVisible, hideNotification, notificationType, nftName } = useNFTNotification();
  const [animationKey, setAnimationKey] = useState(0);

  // Force re-render of component when notification becomes visible
  // This ensures animation plays every time
  useEffect(() => {
    if (isVisible) {
      // Increment key to force component re-render with fresh animation
      setAnimationKey(prev => prev + 1);
      
      console.log('🔔 NFTNotification is visible:', { 
        type: notificationType, 
        name: nftName,
        isVisible,
        animationKey
      });
    }
  }, [isVisible, notificationType, nftName]);
  
  // Force log the notification type to debug
  console.log('CURRENT NOTIFICATION TYPE:', notificationType, 'IS VISIBLE:', isVisible);



  return (
    <div key={animationKey} className="notification-wrapper">
      {/* Always render the notification component but control visibility with the show prop */}
      <NotificationHeader
        show={Boolean(notificationType && isVisible)}
        onHide={hideNotification}
        type={notificationType === 'like' ? 'success' : 'error'}
        message={notificationType === 'like' ? 'Added to library' : 'Removed from library'}
        highlightText={nftName ? nftName.replace(/\s*[×Xx]\s*$/, '') : ''} // Remove any X at the end of the name
        autoHideDuration={4000}
        onLogoClick={onReset}
      />
      <style jsx>{`
        .notification-wrapper {
          position: relative;
          z-index: 9999;
        }
      `}</style>
    </div>
  );
};

export default NFTNotification;
