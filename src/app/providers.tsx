"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useState, useEffect } from 'react';
import { Frame } from '~/components/frame/Frame';
import type { FrameContext } from '@farcaster/frame-core';
import { VideoPlayProvider } from '../contexts/VideoPlayContext';
import { UserImageProvider } from '../contexts/UserImageContext';
import { Toaster } from 'react-hot-toast';
import NetworkProvider from '../providers/NetworkProvider';
import { ensurePodplayrFollow } from '../lib/firebase';

const WagmiProvider = dynamic(
  () => import("~/components/providers/WagmiProvider"),
  {
    ssr: false,
  }
);

export const FarcasterContext = createContext<{ fid?: number }>({});

export function Providers({ children }: { children: React.ReactNode }) {
  const [fid, setFid] = useState<number>();
  const [initialProfileImage, setInitialProfileImage] = useState<string>();
  
  // Ensure user follows PODPlayr account whenever they log in
  useEffect(() => {
    if (fid) {
      // Add a small delay to ensure Firebase is ready
      const timer = setTimeout(() => {
        ensurePodplayrFollow(fid);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [fid]);

  return (
    <WagmiProvider>
      <FarcasterContext.Provider value={{ fid }}>
        <NetworkProvider>
          <UserImageProvider 
            fid={fid}
            initialProfileImage={initialProfileImage}
          >
            <VideoPlayProvider>
              <Frame 
                onContextUpdate={(context) => {
                  console.log('Farcaster context:', context);
                  if (context?.user?.fid && context.user.fid !== 1) {
                    setFid(context.user.fid);
                    setInitialProfileImage(context.user.pfpUrl);
                  }
                }}
              />
              <Toaster position="top-center" />
              {children}
            </VideoPlayProvider>
          </UserImageProvider>
        </NetworkProvider>
      </FarcasterContext.Provider>
    </WagmiProvider>
  );
}