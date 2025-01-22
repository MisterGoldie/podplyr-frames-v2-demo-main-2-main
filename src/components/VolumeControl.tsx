import React, { useState, useEffect, useRef } from 'react';

interface VolumeControlProps {
  audioElement: HTMLAudioElement | null;
  orientation?: 'vertical' | 'horizontal';
}

const VolumeControl: React.FC<VolumeControlProps> = ({ 
  audioElement,
  orientation = 'vertical'
}) => {
  const [volume, setVolume] = useState(1);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (audioElement) {
      audioElement.volume = volume;
    }
  }, [volume, audioElement]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioElement) {
      audioElement.volume = newVolume;
    }
  };

  const showVolumeBar = () => {
    setIsVisible(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 2000);
  };

  return (
    <div 
      className={`absolute ${orientation === 'vertical' ? 'right-0 top-1/2 -translate-y-1/2 h-32' : 'bottom-0 left-1/2 -translate-x-1/2 w-32'} 
        transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={showVolumeBar}
    >
      <div className={`relative ${orientation === 'vertical' ? 'h-full w-8' : 'w-full h-8'} 
        bg-black/20 backdrop-blur-lg rounded-full mx-2`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          className={`absolute ${orientation === 'vertical' ? 
            'h-full w-2 -rotate-90 origin-center translate-x-3' : 
            'w-full h-2'} 
            appearance-none bg-transparent cursor-pointer`}
          style={{
            background: `linear-gradient(${orientation === 'vertical' ? '180deg' : '90deg'}, 
              #4ade80 0%, #4ade80 ${volume * 100}%, 
              rgba(255,255,255,0.2) ${volume * 100}%, rgba(255,255,255,0.2) 100%)`
          }}
        />
      </div>
    </div>
  );
};

export default VolumeControl; 