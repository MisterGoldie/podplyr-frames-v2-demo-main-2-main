const Mux = require('@mux/mux-node');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

const muxClient = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

const Video = muxClient.video;

// The mediaKeys for our 3 featured NFTs
const FEATURED_MEDIA_KEYS = [
  'arweave_net_hvz4oe2mdf6g1o1rx9y_lkqegya_0zsryy1jxqpl2v0_arweave_net_noyvgupxqyo2p7c2gmnnuseml29hen6hlyvxobd7jyq',
  'arweave_net_9mmnotzjecfztwl3aaebxdrq7ukco2n4oryh6zpzsyu_arweave_net_fxmkbkgv79p3qil8589uh68_skuxbmubzqwvwh10v74',
  'arweave_net_qsvebtd0fuz8vebk4yxorkwdqtw8bpnwj7o46hzksv8_arweave_net_wvad7cgtidfmh3mobjrhoev5_bkvvar9zzh2bhqsl7m'
];

async function cleanupDuplicateAssets() {
  console.log('Fetching all Mux assets...');
  
  // Get all assets with pagination
  let allAssets: any[] = [];
  let hasMore = true;
  let page = 1;
  
  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    const response = await Video.assets.list({ page, limit: 25 });
    allAssets = allAssets.concat(response.data);
    hasMore = response.data.length === 25;
    page++;
  }
  
  console.log(`Found ${allAssets.length} total assets.`);
  
  interface MuxAsset {
    id: string;
    status: string;
    passthrough?: string;
    created_at: string;
  }

  // Group assets by mediaKey
  const assetsByMediaKey = new Map<string, MuxAsset[]>();
  
  // First, group all assets
  allAssets.forEach((asset: MuxAsset) => {
    const mediaKey = asset.passthrough || 'unknown';
    const group = assetsByMediaKey.get(mediaKey) || [];
    group.push(asset);
    assetsByMediaKey.set(mediaKey, group);
  });

  // Keep track of assets we want to keep
  const assetsToKeep = new Set<string>();

  // For each featured NFT, find the oldest ready asset
  for (const mediaKey of FEATURED_MEDIA_KEYS) {
    const group = assetsByMediaKey.get(mediaKey) || [];
    const readyAssets = group
      .filter(asset => asset.status === 'ready')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (readyAssets.length > 0) {
      const keepAsset = readyAssets[0];
      assetsToKeep.add(keepAsset.id);
      console.log(`Will keep asset ${keepAsset.id} for ${mediaKey}`);
    }
  }

  // Delete all assets except the ones we want to keep
  console.log('\nStarting cleanup...');
  let deletedCount = 0;
  for (const asset of allAssets) {
    if (!assetsToKeep.has(asset.id)) {
      try {
        console.log(`Deleting asset: ${asset.id}`);
        await Video.assets.delete(asset.id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete asset ${asset.id}:`, error);
      }
    }
  }

  console.log(`\nCleanup complete! Kept ${assetsToKeep.size} assets, deleted ${deletedCount} assets.`);
}

cleanupDuplicateAssets().catch(console.error);
