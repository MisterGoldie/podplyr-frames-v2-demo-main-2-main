import { ImageResponse } from "next/og";

export const alt = "Nuke";
export const size = {
  width: 600,
  height: 400,
};

export const contentType = "image/png";

export default async function Image() {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://your-default-url.vercel.app';
  
  return new ImageResponse(
    (
      <div tw="h-full w-full flex flex-col justify-center items-center relative">
        <img
          src={`${baseUrl}/image.png`}
          alt="Nuke"
          tw="w-full h-full object-cover"
        />
      </div>
    ),
    {
      width: 600,
      height: 400,
    }
  );
}
