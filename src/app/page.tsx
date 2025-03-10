import { Metadata } from "next";
import App from "./app";
import dynamic from "next/dynamic";
import ErrorBoundary from '../components/ErrorBoundary';
import Demo from '../components/Demo';

const appUrl = process.env.NEXT_PUBLIC_URL;

const frame = {
  version: "next",
  imageUrl: `${appUrl}/image.png`,
  button: {
    title: "Enter POD Playr",
    action: {
      type: "launch_frame",
      name: "POD Playr",
      url: appUrl,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#000000",
    },
  },
};

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "POD Playr",
    openGraph: {
      title: "POD Playr",
      description: "Listen & Watch NFTs on PODPlayr",
      images: [
        {
          url: `${appUrl}/image.png`,
          width: 1200,
          height: 630,
          alt: "POD Playr Media Player",
        },
      ],
    },
    other: {
      "fc:frame": JSON.stringify(frame),
    },
  };
}

export default function Home() {
  return (<App />);
}