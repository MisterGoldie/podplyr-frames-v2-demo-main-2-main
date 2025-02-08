'use client';

import { useEffect } from 'react';
import { searchUsers, getLikedNFTs } from '../../lib/firebase';
import { fetchUserNFTsFromAlchemy } from '../../lib/alchemy';
import type { NFT, FarcasterUser } from '../../types/user';

const NFT_CACHE_KEY = 'podplayr_nft_cache_';
const TWO_HOURS = 2 * 60 * 60 * 1000;

interface UserDataLoaderProps {
  userFid: number;
  onUserDataLoaded: (userData: FarcasterUser) => void;
  onNFTsLoaded: (nfts: NFT[]) => void;
  onLikedNFTsLoaded: (nfts: NFT[]) => void;
  onError: (error: string) => void;
}

const getCachedNFTs = (userId: number): NFT[] | null => {
  const cached = localStorage.getItem(`${NFT_CACHE_KEY}${userId}`);
  if (cached) {
    const { nfts, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < TWO_HOURS) {
      return nfts;
    }
  }
  return null;
};

export const UserDataLoader: React.FC<UserDataLoaderProps> = ({
  userFid,
  onUserDataLoaded,
  onNFTsLoaded,
  onLikedNFTsLoaded,
  onError
}) => {
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Get Farcaster user data
        const users = await searchUsers(userFid.toString());
        if (!users?.length) {
          onError('User not found');
          return;
        }

        const userData = users[0];
        onUserDataLoaded(userData);

        // Get addresses
        const addresses = [
          userData.custody_address,
          ...(userData.verified_addresses?.eth_addresses || [])
        ].filter(Boolean) as string[];

        if (!addresses.length) {
          onError('No wallet addresses found');
          return;
        }

        // Try cached NFTs first
        const cachedNFTs = getCachedNFTs(userFid);
        if (cachedNFTs) {
          const hasValidStructure = cachedNFTs.every(nft => 
            nft.hasOwnProperty('contract') && 
            nft.hasOwnProperty('tokenId') && 
            nft.hasOwnProperty('metadata')
          );

          if (hasValidStructure) {
            onNFTsLoaded(cachedNFTs);
            return;
          }
          localStorage.removeItem(`${NFT_CACHE_KEY}${userFid}`);
        }

        // Fetch fresh NFTs
        const nftPromises = addresses.map(address => fetchUserNFTsFromAlchemy(address));
        const nftResults = await Promise.all(nftPromises);
        const allNFTs = nftResults.flat();

        // Cache NFTs
        localStorage.setItem(`${NFT_CACHE_KEY}${userFid}`, JSON.stringify({
          nfts: allNFTs,
          timestamp: Date.now()
        }));

        onNFTsLoaded(allNFTs);

        // Load liked NFTs
        const likedNFTs = await getLikedNFTs(userFid);
        onLikedNFTsLoaded(likedNFTs);

      } catch (error) {
        console.error('Error loading user data:', error);
        onError('Failed to load user data');
      }
    };

    if (userFid) {
      loadUserData();
    }
  }, [userFid, onUserDataLoaded, onNFTsLoaded, onLikedNFTsLoaded, onError]);

  return null;
};

export default UserDataLoader;
