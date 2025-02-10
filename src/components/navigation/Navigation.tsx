import React from 'react';

type View = 'home' | 'explore' | 'library' | 'profile';

interface NavigationProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange }) => {
  return (
    <nav className="flex items-center justify-around p-4 bg-black border-t border-green-400/30">
      <button
        onClick={() => onViewChange('home')}
        className={`flex flex-col items-center p-2 ${
          currentView === 'home' ? 'text-green-400' : 'text-gray-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
          <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/>
        </svg>
        <span className="text-sm mt-1">Home</span>
      </button>

      <button
        onClick={() => onViewChange('explore')}
        className={`flex flex-col items-center p-2 ${
          currentView === 'explore' ? 'text-green-400' : 'text-gray-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
          <path d="M784-160 532-412q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-620q0-109 75.5-184.5T380-880q109 0 184.5 75.5T640-620q0 44-14 83t-38 69l252 252-56 56ZM380-400q92 0 156-64t64-156q0-92-64-156t-156-64q-92 0-156 64t-64 156q0 92 64 156t156 64Z"/>
        </svg>
        <span className="text-sm mt-1">Explore</span>
      </button>

      <button
        onClick={() => onViewChange('library')}
        className={`flex flex-col items-center p-2 ${
          currentView === 'library' ? 'text-green-400' : 'text-gray-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
          <path d="m480-240 160-160-160-160v320ZM320-280v-400l240 200-240 200Zm160-120Z"/>
        </svg>
        <span className="text-sm mt-1">Library</span>
      </button>

      <button
        onClick={() => onViewChange('profile')}
        className={`flex flex-col items-center p-2 ${
          currentView === 'profile' ? 'text-green-400' : 'text-gray-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
          <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"/>
        </svg>
        <span className="text-sm mt-1">Profile</span>
      </button>
    </nav>
  );
};