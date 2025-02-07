"use client";

import dynamic from "next/dynamic";
import { PlayerProvider } from "../contexts/PlayerContext";
import { useSession } from "next-auth/react";

const Demo = dynamic(() => import("../components/Demo"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#190F23] to-[#0A050F]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
    </div>
  ),
});

export default function App() {
  const { data: session } = useSession();
  const userFid = session?.user?.fid;

  if (!userFid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#190F23] to-[#0A050F]">
        <div>Please sign in with Farcaster to continue</div>
      </div>
    );
  }

  return (
    <PlayerProvider>
      <main className="min-h-screen flex flex-col bg-gradient-to-br from-[#190F23] to-[#0A050F]">
        <Demo fid={userFid} />
      </main>
    </PlayerProvider>
  );
}