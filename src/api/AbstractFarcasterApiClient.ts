import { prioritizeVideoPlayback } from '../utils/networkPrioritizer';

async fetch(url: string, options?: RequestInit): Promise<Response> {
  return prioritizeVideoPlayback(
    () => fetch(url, options),
    { isEssential: url.includes('/essential-endpoint/') }
  );
} 