interface OptimizedImage {
  file: File;
  width: number;
  height: number;
  size: number;
}

export const optimizeImage = async (file: File, maxWidth = 680, maxHeight = 560, quality = 0.85): Promise<OptimizedImage> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Set canvas size
      canvas.width = width;
      canvas.height = height;

      // Draw and optimize
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }

          // Create optimized file
          const optimizedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, "") + '.jpg',
            { type: 'image/jpeg' }
          );

          resolve({
            file: optimizedFile,
            width,
            height,
            size: optimizedFile.size
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Load image from file
    img.src = URL.createObjectURL(file);
  });
};

export function getOptimizedImageUrl(url: string, options: {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  isMobile?: boolean;
} = {}): string {
  if (!url) return '';
  
  // Don't try to optimize data URLs or relative URLs
  if (url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }
  
  const {
    width = options.isMobile ? 400 : 800,
    height = options.isMobile ? 400 : 800,
    quality = options.isMobile ? 70 : 85,
    format = 'webp',
    isMobile = false
  } = options;

  // For IPFS URLs: Use an IPFS gateway that supports image optimization
  if (url.includes('ipfs://')) {
    const ipfsHash = url.replace('ipfs://', '');
    return `https://cloudflare-ipfs.com/ipfs/${ipfsHash}?img-width=${width}&img-height=${height}&img-format=${format}&img-quality=${quality}`;
  }
  
  // For Arweave URLs
  if (url.includes('ar://')) {
    const arweaveHash = url.replace('ar://', '');
    return `https://arweave.net/${arweaveHash}`;
  }

  // For normal HTTP URLs that don't support optimization parameters, just return the URL
  return url;
}
