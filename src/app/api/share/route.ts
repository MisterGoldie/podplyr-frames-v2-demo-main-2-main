import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

const appUrl = process.env.NEXT_PUBLIC_URL;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const contract = url.searchParams.get('contract');
    const tokenId = url.searchParams.get('tokenId');

    if (!contract || !tokenId) {
      return new Response('Missing contract or tokenId', { status: 400 });
    }

    const frameMetadata = {
      version: 'vNext',
      image: `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`,
      buttons: [
        {
          label: 'Play on PODPlayr',
          action: 'post'
        }
      ],
      postUrl: `${appUrl}/api/frame?contract=${contract}&tokenId=${tokenId}`
    };

    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>PODPlayr NFT</title>
          <meta property="fc:frame" content="vNext" />
          <meta property="fc:frame:image" content="${frameMetadata.image}" />
          <meta property="fc:frame:button:1" content="Play on PODPlayr" />
          <meta property="fc:frame:post_url" content="${frameMetadata.postUrl}" />
          <meta property="og:image" content="${frameMetadata.image}" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content="${frameMetadata.image}" />
          <meta http-equiv="refresh" content="0;url=${appUrl}/?contract=${contract}&tokenId=${tokenId}" />
        </head>
        <body>
          <p>Redirecting to PODPlayr...</p>
        </body>
      </html>`,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error) {
    console.error('Error in share route:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
