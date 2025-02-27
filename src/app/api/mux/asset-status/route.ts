import { NextResponse } from 'next/server';
import Mux from '@mux/mux-node';

const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

const Video = muxClient.video;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('id');

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log('Checking status for Mux asset:', assetId);
    
    const asset = await Video.assets.retrieve(assetId);
    
    // Log the asset for debugging
    console.log('Mux asset status:', asset);
    
    return NextResponse.json({
      status: asset.status,
      playback_ids: asset.playback_ids,
      is_ready: asset.status === 'ready',
      duration: asset.duration,
      created_at: asset.created_at
    });
  } catch (error) {
    console.error('Error checking Mux asset status:', error);
    return NextResponse.json(
      { error: 'Failed to check asset status' },
      { status: 500 }
    );
  }
}
