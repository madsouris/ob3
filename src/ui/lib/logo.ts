export const MAX_LOGO_EDGE = 768;
export const MAX_LOGO_BYTES = 512 * 1024;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Fits an image inside a square, never upscaling, keeping at least 1 px. */
export const fitDimensions = (width: number, height: number, maxEdge: number): Dimensions => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { width: 1, height: 1 };
  }

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image'));
    };
    image.src = url;
  });

const encodePng = (image: HTMLImageElement, maxEdge: number): Promise<Blob> => {
  const { width, height } = fitDimensions(image.naturalWidth, image.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (context === null) return Promise.reject(new Error('Canvas is not available'));
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('Could not encode the image'));
      else resolve(blob);
    }, 'image/png');
  });
};

/**
 * Re-encodes any browser-decodable image as PNG. Drawing through a canvas
 * strips EXIF (including GPS) and applies the image's orientation, and the
 * result fits within 768 px and 512 KB.
 */
export const prepareLogo = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  if (file.size > 20 * 1024 * 1024) throw new Error('That image is too large; use one under 20 MB');

  const image = await loadImage(file);

  for (const edge of [MAX_LOGO_EDGE, 512, 384, 256]) {
    const blob = await encodePng(image, edge);
    if (blob.size <= MAX_LOGO_BYTES) return blob;
  }

  throw new Error('Logo is still over 512 KB after resizing; try a simpler image');
};
