import React, { useEffect } from 'react';

// At the top level of your application, add this code
useEffect(() => {
  // REFINED SOLUTION: Keep heart icons consistent while allowing normal functionality
  
  // Store initial like state of NFTs when app loads
  const initialLikeStates = new Map();
  
  // Wait for initial render, then record all liked NFTs
  setTimeout(() => {
    // Find all heart icons that are red on initial load
    document.querySelectorAll('.text-red-500.fill-red-500').forEach(heart => {
      // Find the closest parent with NFT data
      const nftCard = heart.closest('[data-nft-id]');
      if (nftCard) {
        const nftId = nftCard.getAttribute('data-nft-id');
        if (nftId) {
          // Record this NFT as initially liked
          initialLikeStates.set(nftId, true);
          console.log(`📝 Recorded initial like state for NFT: ${nftId}`);
        }
      }
    });
    
    console.log(`📊 Recorded ${initialLikeStates.size} initially liked NFTs`);
  }, 1000); // Wait 1 second for initial render
  
  // Create a function that preserves like states but allows toggling
  const preserveLikeStates = () => {
    // Use MutationObserver to watch for class changes on heart icons
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'class' && 
            mutation.target instanceof HTMLElement) {
          
          const element = mutation.target;
          
          // If this is a heart icon changing from red to white
          if (element.classList.contains('text-white') && 
              !element.classList.contains('text-red-500')) {
            
            // Find the NFT ID this heart belongs to
            const nftCard = element.closest('[data-nft-id]');
            if (nftCard) {
              const nftId = nftCard.getAttribute('data-nft-id');
              
              // If this NFT was initially liked and hasn't been explicitly unliked
              if (nftId && initialLikeStates.get(nftId) === true && 
                  !nftCard.hasAttribute('data-user-unliked')) {
                
                // Force heart back to red
                element.classList.remove('text-white');
                element.classList.add('text-red-500', 'fill-red-500');
                console.log(`🛡️ Protected like state for NFT: ${nftId}`);
              }
            }
          }
        }
      });
    });
    
    // Start observing the entire document
    observer.observe(document.body, { 
      attributes: true, 
      subtree: true,
      attributeFilter: ['class'] 
    });
    
    return () => observer.disconnect();
  };
  
  // Start preserving like states
  const cleanup = preserveLikeStates();
  
  return cleanup;
}, []); 