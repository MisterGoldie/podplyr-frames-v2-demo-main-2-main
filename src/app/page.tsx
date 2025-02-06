import { Metadata } from "next";
import App from "./app";
import dynamic from "next/dynamic";
import { ErrorBoundary } from '../components/ErrorBoundary';
import Demo from '../components/Demo';

const appUrl = process.env.NEXT_PUBLIC_URL;

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const frameMetadata = {
    version: 'vNext',
    image: `${appUrl}/api/og`,
    buttons: [
      {
        label: 'Play',
        action: 'post'
      }
    ],
    postUrl: `${appUrl}/api/frame`
  };

  return {
    title: "POD Playr",
    description: "Your Web3 Media Player",
    openGraph: {
      title: "POD Playr",
      description: "Your Web3 Media Player from the POD team",
      images: [`${appUrl}/api/og`],
    },
    other: {
      'fc:frame': JSON.stringify(frameMetadata),
      'fc:frame:image': `${appUrl}/api/og`,
      'fc:frame:button:1': 'Play',
      'fc:frame:post_url': `${appUrl}/api/frame`,
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