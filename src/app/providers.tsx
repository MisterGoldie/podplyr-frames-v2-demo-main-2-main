"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useState } from 'react';
import { Frame } from '~/components/frame/Frame';
import type { FrameContext } from '@farcaster/frame-core';
import { VideoPlayProvider } from '../contexts/VideoPlayContext';

const WagmiProvider = dynamic(
  () => import("~/components/providers/WagmiProvider"),
  {
    ssr: false,
  }
);

export const FarcasterContext = createContext<{ fid?: number }>({});

export function Providers({ children }: { children: React.ReactNode }) {
  const [fid, setFid] = useState<number>();

  return (
    <WagmiProvider>
      <FarcasterContext.Provider value={{ fid }}>
        <VideoPlayProvider>
          <Frame 
            onContextUpdate={(context) => {
              console.log('Farcaster context:', context);
              if (context?.user?.fid && context.user.fid !== 1) {
                setFid(context.user.fid);
              }
            }}
          />
          {children}
        </VideoPlayProvider>
      </FarcasterContext.Provider>
    </WagmiProvider>
  );
}