'use client';

import { Player as BasePlayer } from './Player';
import { NFT } from '../../types/user';
import { FC } from 'react';

interface PlayerClientProps {
  nft: NFT;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  isMinimized: boolean;
  onMinimizeToggle: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
}

export const PlayerClient: FC<PlayerClientProps> = (props) => {
  return <BasePlayer {...props} />;
}; 