"use client";

import dynamic from "next/dynamic";
import { Frame } from '~/components/frame/Frame';

const WagmiProvider = dynamic(
  () => import("~/components/providers/WagmiProvider"),
  {
    ssr: false,
  }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      <Frame 
        onContextUpdate={(context) => {
          console.log('Farcaster context:', context);
          // Handle context updates here
        }}
      />
      {children}
    </WagmiProvider>
  );
}