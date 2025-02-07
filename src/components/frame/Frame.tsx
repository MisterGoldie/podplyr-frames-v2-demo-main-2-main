'use client';

import { useEffect, useState } from 'react';
import sdk from "@farcaster/frame-sdk";
import type { FrameContext } from '@farcaster/frame-core';

interface FrameProps {
  onContextUpdate?: (context: FrameContext) => void;
}

export const Frame: React.FC<FrameProps> = ({ onContextUpdate }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const context = await sdk.context;
        if (context) {
          onContextUpdate?.(context);
        } else {
          setError("Failed to load Farcaster context");
        }
        await sdk.actions.ready();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize SDK",
        );
        console.error("SDK initialization error:", err);
      }
    };

    load();
  }, [onContextUpdate]);

  if (error) {
    console.error('Frame error:', error);
  }

  return null;
};