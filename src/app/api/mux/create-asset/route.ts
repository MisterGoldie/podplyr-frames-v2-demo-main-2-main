import { NextResponse } from 'next/server';
import Mux from '@mux/mux-node';

// Initialize Mux client with detailed logging
const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

const Video = muxClient.video;

console.log('Mux client initialized with token ID:', process.env.MUX_TOKEN_ID);

// Add CORS headers to response
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { url, mediaKey } = await req.json();
    console.log('Creating Mux asset with mediaKey:', mediaKey);
    console.log('Creating Mux asset for URL:', url);
    
    if (!url) {
      throw new Error('No URL provided');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Check if asset with this mediaKey already exists
    const assets = await Video.assets.list();
    const existingAsset = assets.data.find(asset => 
      asset.passthrough === mediaKey && 
      asset.status !== 'errored'
    );

    if (existingAsset) {
      console.log('Found existing asset for mediaKey:', mediaKey);
      return NextResponse.json({
        playbackId: existingAsset.playback_ids?.[0]?.id,
        status: existingAsset.status
      }, { headers: corsHeaders });
    }

    // Create a new Mux asset with detailed options
    // Create optimized renditions for mobile
    const asset = await Video.assets.create({
      input: [{ url }],
      playback_policy: ['public'],
      test: false,
      passthrough: mediaKey, // Store mediaKey for future lookups
      mp4_support: 'standard',
      encoding_tier: 'baseline', // More optimized for mobile
      normalize_audio: true, // Improve audio consistency
      per_title_encode: true, // Optimize based on content
    });

    console.log('Mux asset created successfully:', {
      assetId: asset.id,
      playbackId: asset.playback_ids?.[0]?.id,
      status: asset.status
    });

    if (!asset.playback_ids?.[0]?.id) {
      throw new Error('No playback ID received from Mux');
    }

    return NextResponse.json({ 
      playbackId: asset.playback_ids[0].id,
      assetId: asset.id,
      status: asset.status
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error creating Mux asset:', {
      error,
      tokenIdExists: !!process.env.MUX_TOKEN_ID,
      tokenSecretExists: !!process.env.MUX_TOKEN_SECRET
    });

    // Log more details about the error
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      muxConfig: {
        tokenIdExists: !!process.env.MUX_TOKEN_ID,
        tokenSecretExists: !!process.env.MUX_TOKEN_SECRET
      }
    };
    console.error('Detailed error creating Mux asset:', errorDetails);

    return NextResponse.json(
      { 
        error: errorDetails.message,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
}
