export const MAX_LOGO_EDGE = 768;
export const MAX_LOGO_BYTES = 512 * 1024;
export const MAX_QR_EDGE = 1024;
export const MAX_QR_BYTES = 512 * 1024;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export type ImageType = 'image/png' | 'image/jpeg';

export interface ImageAttempt {
  readonly maxEdge: number;
  /** Ignored for PNG. */
  readonly quality?: number;
}

export interface PrepareImageOptions {
  readonly type: ImageType;
  readonly maxBytes: number;
  /** Tried in order until one fits under `maxBytes`. */
  readonly attempts: readonly ImageAttempt[];
  /** Filled before drawing; JPEG has no alpha, so a white matte keeps edges clean. */
  readonly background?: string;
  /** Used in the error message, e.g. "Logo". */
  readonly label: string;
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

const encode = (
  image: HTMLImageElement,
  options: PrepareImageOptions,
  attempt: ImageAttempt,
): Promise<Blob> => {
  const { width, height } = fitDimensions(image.naturalWidth, image.naturalHeight, attempt.maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (context === null) return Promise.reject(new Error('Canvas is not available'));

  if (options.background !== undefined) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('Could not encode the image'));
        else resolve(blob);
      },
      options.type,
      attempt.quality,
    );
  });
};

/**
 * Re-encodes any browser-decodable image. Drawing through a canvas strips EXIF
 * (including GPS) and applies the image's orientation; the result fits within
 * the first attempt whose bytes land under `maxBytes`.
 */
export const prepareImage = async (file: File, options: PrepareImageOptions): Promise<Blob> => {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  if (file.size > 20 * 1024 * 1024) throw new Error('That image is too large; use one under 20 MB');

  const image = await loadImage(file);

  for (const attempt of options.attempts) {
    const blob = await encode(image, options, attempt);
    if (blob.size <= options.maxBytes) return blob;
  }

  throw new Error(
    `${options.label} is still over ${Math.round(options.maxBytes / 1024)} KB after resizing; try a simpler image`,
  );
};

/** Logos are PNG so transparency survives on paper. */
export const prepareLogo = (file: File): Promise<Blob> =>
  prepareImage(file, {
    type: 'image/png',
    maxBytes: MAX_LOGO_BYTES,
    label: 'Logo',
    attempts: [{ maxEdge: MAX_LOGO_EDGE }, { maxEdge: 512 }, { maxEdge: 384 }, { maxEdge: 256 }],
  });

/**
 * Payment QR codes are stored as JPEG (`.ob/assets/qr.jpg`). The white matte
 * matters: a transparent PNG would turn black, and a dark QR on a dark matte
 * does not scan. Quality stays high because JPEG artefacts hurt scanning.
 */
export const prepareQr = (file: File): Promise<Blob> =>
  prepareImage(file, {
    type: 'image/jpeg',
    maxBytes: MAX_QR_BYTES,
    background: '#ffffff',
    label: 'Payment QR',
    attempts: [
      { maxEdge: MAX_QR_EDGE, quality: 0.95 },
      { maxEdge: MAX_QR_EDGE, quality: 0.9 },
      { maxEdge: 768, quality: 0.9 },
      { maxEdge: 640, quality: 0.85 },
    ],
  });
