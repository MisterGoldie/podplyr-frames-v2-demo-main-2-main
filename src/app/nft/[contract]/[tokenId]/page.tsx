import { Metadata } from 'next';
import { getNFTMetadata } from '../../../../lib/nft';

interface Props {
  params: {
    contract: string;
    tokenId: string;
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { contract, tokenId } = params;
  const nft = await getNFTMetadata(contract, tokenId);
  const appUrl = process.env.NEXT_PUBLIC_URL;

  const frameMetadata = {
    title: nft.name || 'PODPlayr NFT',
    description: nft.description || 'Listen to this NFT on PODPlayr',
    openGraph: {
      title: nft.name || 'PODPlayr NFT',
      description: nft.description || 'Listen to this NFT on PODPlayr',
      images: [nft.metadata?.image || `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`],
    },
    other: {
      'fc:frame': 'vNext',
      'fc:frame:image': nft.metadata?.image || `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`,
      'fc:frame:button:1': '▶️ Play on PODPlayr',
      'fc:frame:button:1:action': 'post',
      'fc:frame:post_url': `${appUrl}/api/frame?contract=${contract}&tokenId=${tokenId}`,
    },
  };

  return frameMetadata;
}

export default async function NFTFramePage({ params }: Props) {
  const { contract, tokenId } = params;
  const nft = await getNFTMetadata(contract, tokenId);
  const appUrl = process.env.NEXT_PUBLIC_URL;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <img 
          src={nft.metadata?.image || `${appUrl}/api/og?contract=${contract}&tokenId=${tokenId}`}
          alt={nft.name || 'NFT Image'}
          className="w-full h-auto rounded-lg shadow-lg"
        />
        <h1 className="text-2xl font-bold mt-4 text-purple-300">{nft.name}</h1>
        {nft.description && (
          <p className="mt-2 text-gray-400">{nft.description}</p>
        )}
        <a
          href={`${appUrl}/?contract=${contract}&tokenId=${tokenId}`}
          className="mt-6 block w-full text-center bg-purple-500 text-black font-semibold py-3 px-6 rounded-lg hover:bg-purple-400 transition-colors"
        >
          ▶️ Play on PODPlayr
        </a>
      </div>
    </div>
  );
}
