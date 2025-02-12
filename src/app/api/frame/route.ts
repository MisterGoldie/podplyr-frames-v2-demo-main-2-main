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
    const nftUrl = `${appUrl}/?contract=${contract}&tokenId=${tokenId}`;
    const frameUrl = `${appUrl}/nft/${contract}/${tokenId}`;

    // Handle button actions based on buttonIndex
    const buttonIndex = untrustedData.buttonIndex;
    
    // Store the interaction with FID
    const token = Math.random().toString(36).substring(2);
    await NotificationStore.create(untrustedData.fid, {
      url: nftUrl,
      token,
      action: buttonIndex === 1 ? 'play' : buttonIndex === 2 ? 'share' : 'library'
    });

    // Return appropriate frame response based on button clicked
    switch (buttonIndex) {
      case 1: // Play - Redirect to player
        return new Response(
          JSON.stringify({
            version: 'vNext',
            image: nft.metadata?.image,
            title: 'Opening PODPlayr...',
            description: `Playing ${nft.name}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      case 2: // Share - Show share success
        return new Response(
          JSON.stringify({
            version: 'vNext',
            image: nft.metadata?.image,
            title: 'Share this NFT',
            description: 'Copy or share this link with friends',
            buttons: [{
              label: '🔗 Copy Link',
              action: 'link',
              target: frameUrl
            }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      case 3: // Add to Library
        return new Response(
          JSON.stringify({
            version: 'vNext',
            image: nft.metadata?.image,
            title: 'Added to Library',
            description: 'This NFT has been added to your library',
            buttons: [{
              label: '▶️ Play Now',
              action: 'post_redirect',
              target: nftUrl
            }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      default: // Initial frame or unknown button
        return new Response(
          JSON.stringify({
            version: 'vNext',
            image: nft.metadata?.image || `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`,
            title: nft.name || 'PODPlayr NFT',
            description: nft.description || 'Listen to this NFT on PODPlayr',
            buttons: [
              {
                label: '▶️ Play on PODPlayr',
                action: 'post_redirect',
                target: nftUrl
              },
              {
                label: '🔗 Share',
                action: 'post'
              },
              {
                label: '📚 Add to Library',
                action: 'post'
              }
            ]
          }),
          { 
            status: 200, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            } 
          }
        );
    }
  } catch (error) {
    console.error('Error in frame route:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}