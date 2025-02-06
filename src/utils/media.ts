import { IPFS_GATEWAYS } from './constants';
import { useState } from 'react';
import { NFT } from '../types/user';

// Function to process media URLs to ensure they're properly formatted
export const processMediaUrl = (url: string): string => {
  if (!url) return '';

  // Handle IPFS URLs
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }

  // Handle Arweave URLs
  if (url.startsWith('ar://')) {
    return url.replace('ar://', 'https://arweave.net/');
  }

  return url;
};

// Function to check if a URL is a video file
export const isVideoUrl = (url: string): boolean => {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
  return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

// Function to check if a URL is an audio file
export const isAudioUrl = (url: string): boolean => {
  if (!url) return false;
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
  return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

// Function to format time in MM:SS format
export const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};