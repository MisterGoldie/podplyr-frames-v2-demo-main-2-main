export async function GET() {  
    const config = {
      accountAssociation: {
        header:
          "eyJmaWQiOjE0ODcxLCJ0eXBlIjoiY3VzdG9keSIsImtleSI6IjB4ODlkQWMwNTM2MEE1QzY5M2Y5OUI2N2Y4Yjc5ZTg4OTkzZDhENzQ0RiJ9",
        payload: "eyJkb21haW4iOiJwb2RwbGF5ci52ZXJjZWwuYXBwIn0",
        signature:
          "MHg3NjliNTc2OTZmNmQwOWIxODY5NWEwNjE5NDdjZmY2NTdiMDJkZGNkYTZhNjQ1ZDZiMDdlMjk1ZDc3YjBhYWRmMDU3NWJlMjUzNWE0ZTcyZmVjMjdmMDM3OTliNzJiODBjMGY5Y2MxMGFkMWZlMzU2YzBjNzc4MjZhNjE1OWYyZjFj",
      },
      frame: {
        version: "1",
        name: "POD Playr",
        iconUrl: "https://podplayr.vercel.app/icon.png",
        homeUrl: "https://podplayr.vercel.app/",
        imageUrl: "https://podplayr.vercel.app/image.jpg",
        buttonTitle: "Check this out",
        splashImageUrl: "https://podplayr.vercel.app/splash.png",
        splashBackgroundColor: "#eeccff",
        webhookUrl: "https://podplayr.vercel.app/api/webhook"
      },
    };
  
    return Response.json(config);
  }
  