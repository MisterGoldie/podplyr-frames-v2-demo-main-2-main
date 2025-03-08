export async function GET() {
  const config = {
    accountAssociation: {
      header: "eyJmaWQiOjEwMTQ0ODUsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHhEQkRCNmVCNUQ5MDE0MTY3NUVCNjdENzk3NDUwMzFlNDY2OGYzZkQyIn0",
      payload: "eyJkb21haW4iOiJwb2RwbGF5ci52ZXJjZWwuYXBwIn0",
      signature: "MHg0ZTMyNjNiNjZjMmQwM2E5NjU2Nzg4MmU0ZWJlY2Y5YzUwNzI4NWJhY2E1ZTZiYmE2YjkyYTg5YWM3MTdkZmU4MzJjNTA1ZDBlOTk4NTc5ZWJiZDVjZTg2YjQ0MWJiYzk5MjViYTgxNTBlOTk3OWI3MmM0MWM2MDA5ODFmNjE3ZTFi"
    },
    frame: {
      version: "1",
      name: "POD Playr",
      iconUrl: "https://podplayr.vercel.app/icon.png",
      homeUrl: "https://podplayr.vercel.app",
      imageUrl: "https://podplayr.vercel.app/image.png",
      buttonTitle: "POD Playr",
      splashImageUrl: "https://podplayr.vercel.app/splash.png",
      splashBackgroundColor: "#000000",
      webhookUrl: "https://podplayr.vercel.app/api/webhook"
    },
  };

  return Response.json(config);
}