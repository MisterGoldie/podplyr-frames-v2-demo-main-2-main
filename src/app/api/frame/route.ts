import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Frame request body:', body);
    
    // Validate that this is a valid frame request
    const { untrustedData, trustedData } = body;
    
    if (!untrustedData?.fid || !trustedData?.messageBytes) {
      return new Response(JSON.stringify({ error: 'Invalid frame request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Basic validation of the frame data
    if (
      typeof untrustedData.buttonIndex !== 'number' ||
      untrustedData.buttonIndex < 1 ||
      !trustedData.messageBytes ||
      typeof trustedData.messageBytes !== 'string'
    ) {
      return new Response(JSON.stringify({ error: 'Invalid frame data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return the next frame state
    return new Response(
      JSON.stringify({
        version: 'vNext',
        image: 'https://podplayr.vercel.app/image.jpg',
        buttons: [
          {
            label: 'Check this out'
          }
        ],
        post_url: 'https://podplayr.vercel.app/api/frame'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
      }
    );
  } catch (error) {
    console.error('Error in frame route:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}