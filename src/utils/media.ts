import { useState } from 'react';
import { NFT } from '../types/user';

// List of reliable IPFS gateways in order of preference
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',         // Primary gateway
  'https://nftstorage.link/ipfs/', // Secondary
  'https://cloudflare-ipfs.com/ipfs/', // Tertiary
  'https://gateway.pinata.cloud/ipfs/' // Final fallback
];

export { IPFS_GATEWAYS };

// Helper function to extract CID from various IPFS URL formats
export const extractIPFSHash = (url: string): string | null => {
  if (!url) return null;

  // Remove any duplicate 'ipfs' in the path
  url = url.replace(/\/ipfs\/ipfs\//, '/ipfs/');

  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', '');
  }

  // Use simple regex for all IPFS hashes as per requirements
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

  // If it's already a working dweb.link URL, return it as is
  if (url.includes('.ipfs.dweb.link')) {
    return url;
  }

  // Remove any duplicate 'ipfs' in the path
  url = url.replace(/\/ipfs\/ipfs\//, '/ipfs/');

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

// Create a safe document ID from a URL by removing invalid characters
const createSafeId = (url: string): string => {
  if (!url) return '';
  
  // Try to extract IPFS hash first
  const ipfsHash = extractIPFSHash(url);
  if (ipfsHash) {
    return `ipfs_${ipfsHash}`;
  }

  // For non-IPFS URLs, create a safe ID by removing all special characters
  return url
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace ALL special chars with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .slice(0, 100); // Limit length
};

// Function to generate consistent mediaKey for NFTs with identical content
export const getMediaKey = (nft: NFT): string => {
  if (!nft) return '';

  // Get all media URLs
  const audioUrl = nft.metadata?.animation_url || nft.audio || '';
  const imageUrl = nft.image || nft.metadata?.image || '';
  const animationUrl = nft.metadata?.animation_url || '';

  // Create safe IDs for each URL
  const safeUrls = [
    audioUrl,
    imageUrl,
    animationUrl
  ]
    .filter(Boolean) // Remove empty strings
    .map(createSafeId)
    .filter(Boolean) // Remove any empty strings after processing
    .sort(); // Sort for consistency

  if (safeUrls.length === 0) {
    // Fallback to contract and tokenId if no valid URLs
    return `${nft.contract || ''}_${nft.tokenId || ''}`
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_');
  }

  // Join with a delimiter and ensure it's Firestore-safe
  return safeUrls.join('_')
};