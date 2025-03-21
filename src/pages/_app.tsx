import React, { useEffect } from 'react';

// At the top level of your app, add this code
useEffect(() => {
  // Define the function to fix library order
  function fixLibraryOrder() {
    console.log("🔍 Attempting to fix library order...");
    
    // Try multiple selectors to find the library container
    const libraryContainers = [
      document.querySelector('.library-grid'),
      document.querySelector('[data-tab="library"] .grid'),
      document.querySelector('.library .grid'),
      document.querySelector('.nft-grid'),
      // Find any grid container with multiple NFT cards
      ...Array.from(document.querySelectorAll('.grid')).filter(el => 
        el.querySelectorAll('[data-nft-id]').length > 1
      )
    ].filter(Boolean);
    
    if (libraryContainers.length === 0) {
      console.log("❌ Could not find library container");
      return false;
    }
    
    // Try each container
    for (const container of libraryContainers) {
      // Find all NFT cards in this container
      const allCards = Array.from(container.children);
      if (allCards.length <= 1) continue;
      
      // Find the Latasha card specifically
      const latashaCard = allCards.find(card => {
        // Check if any text in this card contains "LATASHA"
        const allText = card.textContent || '';
        return allText.toUpperCase().includes('LATASHA');
      });
      
      if (!latashaCard) continue;
      
      // Remove and insert at beginning
      latashaCard.remove();
      container.insertBefore(latashaCard, container.firstChild);
      
      console.log("🔄 Moved Latasha card to the front of the library");
      return true;
    }
    
    return false;
  }

  // Run when user clicks on Library tab
  const handleTabClick = (event) => {
    if (event.target.closest('[href*="library"], .library-tab, [data-tab="library"]')) {
      console.log("📚 Library tab clicked, will fix order");
      // Try multiple times to make sure it works
      setTimeout(fixLibraryOrder, 100);
      setTimeout(fixLibraryOrder, 500);
      setTimeout(fixLibraryOrder, 1000);
    }
  };

  // Listen for tab clicks
  document.addEventListener('click', handleTabClick);
  
  // Also try whenever DOM changes to catch library loads
  const observer = new MutationObserver(() => {
    // Check if we're on library tab based on URL or active tab
    const isLibraryTab = window.location.href.includes('library') || 
                         document.querySelector('.library-tab.active, [data-tab="library"].active');
    
    if (isLibraryTab) {
      setTimeout(fixLibraryOrder, 100);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Try immediately and after a short delay
  setTimeout(fixLibraryOrder, 500);
  setTimeout(fixLibraryOrder, 1500);
  
  return () => {
    document.removeEventListener('click', handleTabClick);
    observer.disconnect();
  };
}, []); 