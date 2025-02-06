import { NextRequest } from 'next/server';
import { neynarClient } from '~/lib/neynar';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate the frame message using Neynar
    const { valid } = await neynarClient.validateFrameAction(body);
    
    if (!valid) {
      return new Response('Invalid frame message', { status: 400 });
    }

    // Handle frame action
    return new Response(JSON.stringify({
      frames: {
        version: 'vNext',
        image: `${process.env.NEXT_PUBLIC_URL}/api/og`,
        buttons: [
          {
            label: 'Play',
            action: 'post'
          }
        ]
      }
    }));
  } catch (error) {
    console.error('Frame error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}