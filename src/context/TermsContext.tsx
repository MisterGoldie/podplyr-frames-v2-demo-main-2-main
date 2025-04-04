import React, { createContext, useContext, useState, useEffect } from 'react';
import { FarcasterContext } from '../app/providers';

// List of Farcaster IDs that should always see the Terms of Service
// This list can be expanded as needed
const ALWAYS_SHOW_TERMS_FIDS = [7472];

interface TermsContextType {
  hasAcceptedTerms: boolean;
  acceptTerms: () => void;
}

const TermsContext = createContext<TermsContextType>({
  hasAcceptedTerms: false,
  acceptTerms: () => {},
});

export const useTerms = () => useContext(TermsContext);

interface TermsProviderProps {
  children: React.ReactNode;
}

export const TermsProvider: React.FC<TermsProviderProps> = ({ children }) => {
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(false);
  
  // Get the current user's FID from context
  const { fid } = useContext(FarcasterContext);
  
  // Check if user should always see terms (special FIDs)
  const isSpecialFid = fid ? ALWAYS_SHOW_TERMS_FIDS.includes(fid) : false;
  
  // Check localStorage on mount to see if user has already accepted terms
  useEffect(() => {
    if (isSpecialFid) {
      // Special FIDs always see the terms
      console.log(`Special FID ${fid} detected - always showing Terms of Service`);
      setHasAcceptedTerms(false);
      return;
    }
    
    const termsAccepted = localStorage.getItem('podplayr_terms_accepted');
    if (termsAccepted === 'true') {
      setHasAcceptedTerms(true);
    }
  }, [fid, isSpecialFid]);
  
  const acceptTerms = () => {
    // Always save acceptance to localStorage, even for special FIDs
    // This ensures normal behavior when they're removed from the special list
    localStorage.setItem('podplayr_terms_accepted', 'true');
    
    // For special FIDs, we don't update the state to maintain the Terms always showing
    // For regular users, we update the state normally
    if (!isSpecialFid) {
      setHasAcceptedTerms(true);
    }
  };
  
  return (
    <TermsContext.Provider value={{ 
      // Override hasAcceptedTerms for special FIDs
      hasAcceptedTerms: isSpecialFid ? false : hasAcceptedTerms, 
      acceptTerms 
    }}>
      {children}
    </TermsContext.Provider>
  );
};
