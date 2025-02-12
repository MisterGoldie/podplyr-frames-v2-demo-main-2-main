import { NextRequest } from 'next/server';
import { NotificationStore } from '../../../lib/NotificationStore';
import { getNFTMetadata } from '../../../lib/nft';

const appUrl = process.env.NEXT_PUBLIC_URL;

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

    // Get contract and tokenId from URL parameters
    const url = new URL(req.url);
    const contract = url.searchParams.get('contract');
    const tokenId = url.searchParams.get('tokenId');

    if (!contract || !tokenId) {
      return new Response(JSON.stringify({ error: 'Missing contract or tokenId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get NFT metadata
    const nft = await getNFTMetadata(contract, tokenId);

    // Generate a unique token for this interaction
    const token = Math.random().toString(36).substring(2);
    const nftUrl = `${appUrl}/?contract=${contract}&tokenId=${tokenId}`;

    // Store the notification with the FID
    await NotificationStore.create(untrustedData.fid, {
      url: nftUrl,
      token
    });

    // Return success frame with NFT preview
    return new Response(
      JSON.stringify({
        version: 'vNext',
        image: nft.metadata?.image || `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`,
        buttons: [
          {
            label: '▶️ Play on PODPlayr',
            action: 'link',
            target: nftUrl
          }
        ],
        title: nft.name || 'PODPlayr NFT',
        description: nft.description || 'Listen to this NFT on PODPlayr'
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