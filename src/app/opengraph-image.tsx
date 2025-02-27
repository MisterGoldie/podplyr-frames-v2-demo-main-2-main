import { ImageResponse } from "next/og";

export const runtime = 'edge';

export const alt = "PODPlayr";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: 60,
            fontWeight: 'bold',
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          PODPlayr
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
