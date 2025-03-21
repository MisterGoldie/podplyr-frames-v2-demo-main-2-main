import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const [likedNfts, setLikedNfts] = useState<Record<string, boolean>>({});
const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

useEffect(() => {
  try {
    const savedLikes = localStorage.getItem('likedNfts');
    if (savedLikes) {
      setLikedNfts(JSON.parse(savedLikes));
    }
  } catch (error) {
    console.error('Error loading liked NFTs from localStorage:', error);
  }
}, []);

useEffect(() => {
  // EMERGENCY FIX: Block any attempts to reset liked status after initial load
  const originalSetLikedNfts = setLikedNfts;
  
  // Override the state setter to prevent certain updates
  const protectedSetLikedNfts: typeof setLikedNfts = (newValueOrUpdater) => {
    // If it's a function updater, let it through
    if (typeof newValueOrUpdater === 'function') {
      originalSetLikedNfts(newValueOrUpdater);
      return;
    }
    
    // If direct value, only allow additions, never removals
    originalSetLikedNfts(prevLikes => {
      // Create merged state that preserves all existing likes
      const mergedState = { ...prevLikes };
      
      // Only add new likes, never remove existing ones
      Object.entries(newValueOrUpdater).forEach(([key, isLiked]) => {
        if (isLiked === true) {
          mergedState[key] = true;
        }
        // Ignore false values - don't allow unlikes through this path
      });
      
      return mergedState;
    });
  };
  
  // @ts-ignore - Replace the setter with our protected version
  setLikedNfts = protectedSetLikedNfts;
}, []);

const fetchLikedNfts = useCallback(async () => {
  if (!userFid) return;
  
  try {
    const likesCollection = collection(db, 'nft_likes');
    const q = query(likesCollection, where('fid', '==', userFid));
    const snapshot = await getDocs(q);
    
    const fetchedLikes: Record<string, boolean> = {};
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const nftKey = `${data.nftContract}-${data.tokenId}`.toLowerCase();
      fetchedLikes[nftKey] = true;
    });
    
    setLikedNfts(prevLikes => {
      const mergedLikes = { ...prevLikes, ...fetchedLikes };
      
      localStorage.setItem('likedNfts', JSON.stringify(mergedLikes));
      
      return mergedLikes;
    });
    
    setIsInitialLoadComplete(true);
  } catch (error) {
    console.error('Error fetching liked NFTs:', error);
  }
}, [userFid]);

const checkIfNftIsLiked = useCallback((nft: NFT): boolean => {
  if (!nft?.contract || !nft?.tokenId) return false;
  
  const nftKey = `${nft.contract}-${nft.tokenId}`.toLowerCase();
  return likedNfts[nftKey] === true;
}, [likedNfts]); 