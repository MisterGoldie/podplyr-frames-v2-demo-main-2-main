import React, { useState, useEffect } from 'react';
import Image from 'next/image';

type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'connection';

interface NotificationHeaderProps {
  show: boolean;
  onHide?: () => void;
  type?: NotificationType;
  message: string;
  highlightText?: string;
  autoHideDuration?: number;
  icon?: React.ReactNode;
  logo?: string;
  onReset?: () => void;
  onLogoClick?: () => void; // New prop for logo click to go home
}

const NotificationHeader: React.FC<NotificationHeaderProps> = ({
  show,
  onHide,
  type = 'info',
  message,
  highlightText,
  autoHideDuration = 3000,
  icon,
  logo = '/fontlogo.png',
  onReset,
  onLogoClick, // Add the new prop
}) => {
  // Initialize with explicitly false states to prevent showing on startup
  const [isBackgroundVisible, setIsBackgroundVisible] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);
  
  // Immediate transition for better visibility
  useEffect(() => {
    if (show) {
      // Force a complete reset of states to ensure proper rendering
      setIsBackgroundVisible(false);
      setIsContentVisible(false);
      
      // Force a reflow before showing
      setTimeout(() => {
        setIsBackgroundVisible(true);
        setIsContentVisible(true);
        console.log('🔔 NOTIFICATION SHOWING with type:', type);
      }, 5);
    } else {
      // When hiding, change content first, then background
      setIsContentVisible(false);
      const timer = setTimeout(() => setIsBackgroundVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [show, type]);
  
  // Auto-hide functionality
  useEffect(() => {
    if (show && autoHideDuration && autoHideDuration > 0) {
      const timer = setTimeout(() => {
        if (onHide) onHide();
      }, autoHideDuration);
      
      return () => clearTimeout(timer);
    }
  }, [show, autoHideDuration, onHide]);
  
  // Get appropriate styles for different notification types
  const getStyles = () => {
    // Force log the type for debugging
    console.log('NOTIFICATION HEADER TYPE:', type);
    
    // Return solid colors based on type with no borders
    switch(type) {
      case 'success':
        return 'bg-green-600';
      case 'warning':
        return 'bg-yellow-600';
      case 'error':
        return 'bg-red-600';
      case 'connection':
        return 'bg-purple-600';
      default:
        return 'bg-blue-600';
    }
  };
  
  // Get default icon if none provided
  const getDefaultIcon = () => {
    switch(type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'connection':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 h-16 flex items-center justify-center z-[9999] ${
        show ? getStyles() : 'bg-black'
      }`}
    >
      {/* Show either notification content or logo based on 'show' prop */}
      {show ? (
        /* Notification content */
        <div className="w-full h-full flex items-center justify-center">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-3">
              {icon || getDefaultIcon()}
            </div>
            <div className="text-white text-sm flex items-center font-mono">
              <span className="font-bold">{message}</span>
              {highlightText && (
                <span className={`font-medium ml-2 truncate max-w-[150px] inline-block ${type === 'success' ? 'text-green-300 font-bold' : 'text-red-300 font-bold'}`}>
                  {highlightText}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Logo container */
        <div className="w-full h-full flex items-center justify-center">
          <button 
            onClick={onLogoClick || onReset} 
            className="cursor-pointer"
          >
            <Image
              src={logo}
              alt="PODPlayr Logo"
              width={120}
              height={30}
              className="logo-image"
              priority={true}
            />
          </button>
        </div>
      )}
    </header>
  );
};

export default NotificationHeader; 