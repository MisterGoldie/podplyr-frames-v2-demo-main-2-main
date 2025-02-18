'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '../utils/serviceWorker';

export const ServiceWorkerProvider = () => {
  useEffect(() => {
    // Register service worker
    registerServiceWorker().catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  }, []);

  return null;
};
