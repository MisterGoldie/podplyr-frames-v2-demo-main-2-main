import { useState } from 'react';
import { PageState } from '../../types/user';

interface BottomNavProps {
  currentPage: PageState;
  onNavigate: (page: keyof PageState) => void;
  onReset?: () => void;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentPage, onNavigate, onReset, className = '' }) => {
  return (
    <nav className={`fixed bottom-0 left-0 right-0 h-20 pb-4 bg-black border-t border-purple-400/30 flex items-center justify-around z-50 ${className}`}>
      <button
        onClick={() => onNavigate('isHome')}
        className={`flex flex-col items-center justify-center w-16 h-16 ${
          currentPage.isHome ? 'text-purple-400' : 'text-gray-400'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
        <span className="text-xs mt-1">Home</span>
      </button>

      <button
        onClick={() => onNavigate('isExplore')}
        className={`flex flex-col items-center justify-center w-16 h-16 ${
          currentPage.isExplore ? 'text-purple-400' : 'text-gray-400'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-xs mt-1">Explore</span>
      </button>

      <button
        onClick={() => onNavigate('isLibrary')}
        className={`flex flex-col items-center justify-center w-16 h-16 ${
          currentPage.isLibrary ? 'text-purple-400' : 'text-gray-400'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        <span className="text-xs mt-1">Library</span>
      </button>

      <button
        onClick={() => onNavigate('isProfile')}
        className={`flex flex-col items-center justify-center w-16 h-16 ${
          currentPage.isProfile ? 'text-purple-400' : 'text-gray-400'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span className="text-xs mt-1">Profile</span>
      </button>
    </nav>
  );
};