import type { Metadata } from "next";

import "~/app/globals.css";
import { Providers } from "~/app/providers";

export const metadata: Metadata = {
  title: "POD Playr",
  description: "Media player created by the POD team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-screen">
      <body className="min-h-screen bg-gradient-to-br from-[rgb(25,15,35)] to-[rgb(10,5,15)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}