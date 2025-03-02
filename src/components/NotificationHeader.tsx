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
}) => {
  const [isVisible, setIsVisible] = useState(show);
  
  // Handle auto-hide functionality
  useEffect(() => {
    setIsVisible(show);
    
    if (show && autoHideDuration) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onHide) onHide();
      }, autoHideDuration);
      
      return () => clearTimeout(timer);
    }
  }, [show, autoHideDuration, onHide]);
  
  // Get appropriate styles for different notification types
  const getStyles = () => {
    switch(type) {
      case 'success':
        return 'bg-green-600 border-b border-green-700';
      case 'warning':
        return 'bg-yellow-600 border-b border-yellow-700';
      case 'error':
        return 'bg-red-600 border-b border-red-700';
      case 'connection':
        return 'bg-purple-600 border-b border-purple-700';
      default:
        return 'bg-blue-600 border-b border-blue-700';
    }
  };
  
  // Get default icon if none provided
  const getDefaultIcon = () => {
    switch(type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
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
      className={`fixed top-0 left-0 right-0 h-16 flex items-center justify-center z-50 transition-all duration-500 ease-in-out ${
        isVisible ? getStyles() : 'bg-black border-b border-black'
      }`}
    >
      {/* Logo - hidden when notification is showing */}
      <div className={`transition-all duration-500 ease-in-out ${
        isVisible ? 'opacity-0 scale-95 absolute' : 'opacity-100 scale-100'
      }`}>
        <Image
          src={logo}
          alt="PODPlayr Logo"
          width={120}
          height={30}
          className="logo-image"
          priority={true}
        />
      </div>
      
      {/* Notification content */}
      <div className={`flex items-center justify-center transition-all duration-500 ease-in-out ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute'
      }`}>
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
          {icon || getDefaultIcon()}
        </div>
        <div className="text-white ml-3 text-lg">
          {message} {highlightText && <span className="font-semibold">{highlightText}</span>}
        </div>
      </div>
    </header>
  );
};

export default NotificationHeader; 