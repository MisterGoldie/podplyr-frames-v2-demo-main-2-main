import { Metadata } from "next";
import App from "./app";
import dynamic from "next/dynamic";
import { ErrorBoundary } from '../components/ErrorBoundary';
import Demo from '../components/Demo';

const appUrl = process.env.NEXT_PUBLIC_URL || "https://podplayr.xyz";

const frame = {
  version: "vNext",
  imageUrl: `${appUrl}/og-image.png`,
  button: {
    title: "Launch PODPlayr",
    action: {
      type: "launch_frame",
      name: "PODPlayr",
      url: appUrl,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#2e1065", // Deep purple
    },
  },
};

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "PODPlayr | NFT Audio Player",
    description: "The web3 audio player that makes NFT music enjoyable and accessible",
    openGraph: {
      title: "PODPlayr | NFT Audio Player",
      description: "Listen to your NFT audio collection & discover new music",
      images: [
        {
          url: `${appUrl}/og-image.jpg`,
          width: 1200,
          height: 630,
          alt: "PODPlayr - NFT Audio Player",
        },
      ],
    },
    other: {
      "fc:frame": JSON.stringify(frame),
      "fc:frame:image": `${appUrl}/og-image.png`,
      "fc:frame:post_url": appUrl,
      "fc:frame:button:1": "Launch PODPlayr",
    },
  };
}

export default function Home() {
  return (
    <ErrorBoundary>
      <Demo />
    </ErrorBoundary>
  );
}