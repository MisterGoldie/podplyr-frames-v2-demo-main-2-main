import { useState } from 'react';
import { NFT } from '../types/user';

// List of reliable IPFS gateways in order of preference
const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/'
];

// Helper function to extract CID from various IPFS URL formats
const extractIPFSHash = (url: string): string | null => {
  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', '');
  }

  // Handle .ipfs.dweb.link format
  const dwebMatch = url.match(/([a-zA-Z0-9]+)\.ipfs\.dweb\.link/);
  if (dwebMatch) {
    return dwebMatch[1];
  }

  // Handle /ipfs/ path format
  const ipfsMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (ipfsMatch) {
    return ipfsMatch[1];
  }

  // Handle direct CID
  if (/^[a-zA-Z0-9]+$/.test(url)) {
    return url;
  }

  return null;
};

// Function to process media URLs to ensure they're properly formatted
export const processMediaUrl = (url: string, fallbackUrl: string = '/default-nft.png'): string => {
  if (!url) return fallbackUrl;

  // If it's an nftstorage.link URL, try using Cloudflare IPFS gateway instead
  if (url.includes('nftstorage.link/ipfs/')) {
    const ipfsHash = url.split('/ipfs/')[1];
    if (ipfsHash) {
      return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
    }
  }

  // If it's already a working dweb.link URL, return it as is
  if (url.includes('.ipfs.dweb.link')) {
    return url;
  }

  // Try to extract IPFS hash
  const ipfsHash = extractIPFSHash(url);
  if (ipfsHash) {
    // Use the first gateway by default
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }

  // Handle Arweave URLs
  if (url.startsWith('ar://')) {
    return url.replace('ar://', 'https://arweave.net/');
  }

  return url || fallbackUrl;
};

// Export the list of gateways so components can try alternatives if needed
export const getAlternativeIPFSUrl = (url: string): string | null => {
  const ipfsHash = extractIPFSHash(url);
  if (!ipfsHash) return null;

  // Find current gateway index
  const currentGatewayIndex = IPFS_GATEWAYS.findIndex(gateway => url.includes(gateway));
  
  // If we're not using any known gateway or we're at the last one, return null
  if (currentGatewayIndex === -1 || currentGatewayIndex === IPFS_GATEWAYS.length - 1) {
    return null;
  }

  // Return URL with next gateway
  return `${IPFS_GATEWAYS[currentGatewayIndex + 1]}${ipfsHash}`;
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