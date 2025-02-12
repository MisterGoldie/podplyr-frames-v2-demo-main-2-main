import type { Metadata } from "next";
import "~/app/globals.css";
import { Providers } from "~/app/providers";
import Script from 'next/script';
import { Space_Grotesk } from 'next/font/google';

const appUrl = process.env.NEXT_PUBLIC_URL;

const frame = {
  version: 'vNext',
  image: `${appUrl}/og-image.jpg`,
  title: 'PODPlayr',
  description: 'Listen & Watch NFTs on PODPlayr',
  buttons: [{
    label: '▶️ Enter PODPlayr',
    action: {
      type: 'post_redirect',
      target: appUrl,
    },
  }],
  postUrl: `${appUrl}/api/frame`,
};

export const metadata: Metadata = {
  title: frame.title,
  description: frame.description,
  openGraph: {
    title: frame.title,
    description: frame.description,
    images: [frame.image],
  },
  other: {
    'fc:frame': frame.version,
    'fc:frame:image': frame.image,
    'fc:frame:post_url': frame.postUrl,
    'fc:frame:button:1': frame.buttons[0].label,
    'fc:frame:button:1:action': 'post_redirect',
    'fc:frame:button:1:target': frame.buttons[0].action.target,
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