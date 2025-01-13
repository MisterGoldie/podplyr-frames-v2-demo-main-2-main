declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_ALCHEMY_API_KEY: string;
    NEXT_PUBLIC_NEYNAR_API_KEY: string;
    NEXT_PUBLIC_HOST: string;
    NEXT_PUBLIC_NGROK_URL: string;
    NEXT_PUBLIC_URL: string;
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
  }
} 