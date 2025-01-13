import { Metadata } from "next";
import App from "./app";
import dynamic from "next/dynamic";



const appUrl = process.env.NEXT_PUBLIC_URL;

const frame = {
  version: "next",
  imageUrl: `${appUrl}/image.png`,
  button: {
    title: "POD Playr",
    action: {
      type: "launch_frame",
      name: "POD Playr",
      url: appUrl,
      splashImageUrl:`${appUrl}/splash.png`,
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
      description: "Yur Web3 Media Player from @themrsazon and the POD team.",
      images: [
        {
          url: `${appUrl}/image.png`,
          width: 1200,
          height: 630,
          alt: "Press Play",
        }
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