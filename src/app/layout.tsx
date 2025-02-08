import type { Metadata } from "next";
import "~/app/globals.css";
import { Providers } from "~/app/providers";
import Script from 'next/script';
import { Space_Grotesk } from 'next/font/google';

export const metadata: Metadata = {
  title: "POD Playr",
  description: "Media player created by the POD team",
  other: {
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://podplayr.vercel.app/image.jpg',
    'fc:frame:button:1': 'Check this out',
    'fc:frame:post_url': 'https://podplayr.vercel.app/api/frame'
  }
};

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.className}>
      <head>
        <Script src="https://cdn.farcaster.xyz/frames/sdk.js" strategy="beforeInteractive" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}