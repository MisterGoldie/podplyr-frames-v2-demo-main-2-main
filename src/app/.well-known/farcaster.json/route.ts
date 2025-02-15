// Types for Farcaster Frame Manifest
type FrameButtonAction = {
  type: 'launch_frame';
  name: string;
  url: string;
  splashImageUrl: string;
  splashBackgroundColor: string;
};

type FrameButton = {
  title: string;
  action: FrameButtonAction;
};

type FrameConfig = {
  version: 'next';
  imageUrl: string;
  button: FrameButton;
};

type TriggerConfig = {
  type: 'frame_action';
  frame: {
    path: string;
  };
};

type FarcasterManifest = {
  accountAssociation: {
    header: string;
    payload: string;
    signature: string;
  };
  frame: FrameConfig;
  triggers?: TriggerConfig[];
};

export async function GET() {  
    const config: FarcasterManifest = {
      accountAssociation: {
        header:
          "eyJmaWQiOjE0ODcxLCJ0eXBlIjoiY3VzdG9keSIsImtleSI6IjB4ODlkQWMwNTM2MEE1QzY5M2Y5OUI2N2Y4Yjc5ZTg4OTkzZDhENzQ0RiJ9",
        payload: "eyJkb21haW4iOiJwb2RwbGF5ci52ZXJjZWwuYXBwIn0",
        signature:
          "MHg3NjliNTc2OTZmNmQwOWIxODY5NWEwNjE5NDdjZmY2NTdiMDJkZGNkYTZhNjQ1ZDZiMDdlMjk1ZDc3YjBhYWRmMDU3NWJlMjUzNWE0ZTcyZmVjMjdmMDM3OTliNzJiODBjMGY5Y2MxMGFkMWZlMzU2YzBjNzc4MjZhNjE1OWYyZjFj",
      },
      frame: {
        version: "next",
        imageUrl: "https://podplayr.vercel.app/image.jpg",
        button: {
          title: "Enter PODPlayr",
          action: {
            type: "launch_frame",
            name: "POD Playr",
            url: "https://podplayr.vercel.app/api/frame",
            splashImageUrl: "https://podplayr.vercel.app/splash.png",
            splashBackgroundColor: "#000000"
          }
        }
      },
      triggers: [
        {
          type: "frame_action",
          frame: {
            path: "/api/frame"
          }
        }
      ]
    };
  
    return Response.json(config);
  }