import Jimp from 'jimp';
import path from 'path';
import fs from 'fs';
// @ts-ignore
import JPEG from 'jpeg-js';

// Override the default decoder to increase the resolution limit to 400MP
// This prevents "maxResolutionInMP limit exceeded" errors on large Wikipedia images
try {
  if ((Jimp as any).decoders && !(Jimp as any).decoders['image/jpeg_custom']) {
    (Jimp as any).decoders['image/jpeg'] = (data: Buffer) => JPEG.decode(data, { 
      maxResolutionInMP: 400, 
      maxMemoryUsageInMB: 1024 
    });
    // Mark as overridden
    (Jimp as any).decoders['image/jpeg_custom'] = true;
    console.log('[Processor] Custom high-resolution JPEG decoder registered successfully.');
  }
} catch (err) {
  console.warn('[Processor] Failed to override default JPEG decoder:', err);
}

// Cache for generated stages to avoid re-processing identical images
const cache: Record<string, string[]> = {};

/**
 * Generates 10 stages of blurred/pixelated base64 JPEG data URIs for a given image.
 * Stage 0 is the most blurred/pixelated.
 * Stage 9 is the original crystal-clear image.
 */
export async function generateBlurStages(source: string, publicFolder: string): Promise<string[]> {
  const cacheKey = source;
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const stages: string[] = [];

  try {
    let original: Jimp;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      console.log(`[Processor] Processing remote image URL: ${source}`);
      original = await Jimp.read(source);
    } else {
      const imagePath = path.join(publicFolder, 'images', source);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      console.log(`[Processor] Processing local image path: ${imagePath}`);
      original = await Jimp.read(imagePath);
    }

    // Downscale source immediately to max 384x384 to speed up processing and transmission
    if (original.getWidth() > 384 || original.getHeight() > 384) {
      original.scaleToFit(384, 384);
    }

    const width = original.getWidth();
    const height = original.getHeight();

    // Define pixelation sizes and blur configurations for 10 stages (0 to 9)
    const configurations = [
      { size: 10, blur: 2 },  // Stage 0: extremely low-res + small blur on tiny scale
      { size: 14, blur: 1 },  // Stage 1
      { size: 20, blur: 1 },  // Stage 2
      { size: 28, blur: 1 },  // Stage 3
      { size: 38, blur: 1 },  // Stage 4
      { size: 52, blur: 1 },  // Stage 5
      { size: 72, blur: 1 },  // Stage 6
      { size: 120, blur: 0 }, // Stage 7: higher res, no blur
      { size: 240, blur: 0 }, // Stage 8: high res, no blur
      { size: -1, blur: 0 },  // Stage 9: original, clean
    ];

    for (let i = 0; i < configurations.length; i++) {
      const conf = configurations[i];
      if (conf.size === -1) {
        // Original image encoded as JPEG
        const base64 = await original.getBase64Async(Jimp.MIME_JPEG);
        stages.push(base64);
      } else {
        const temp = original.clone();
        
        // 1. Resize down first (very fast)
        temp.resize(conf.size, Jimp.AUTO);

        // 2. Apply blur on the tiny image itself (virtually 0 ms!)
        if (conf.blur > 0) {
          temp.blur(conf.blur);
        }

        // 3. Resize back up to game dimensions using nearest neighbor for crisp blocky pixelation
        temp.resize(width, height, Jimp.RESIZE_NEAREST_NEIGHBOR);

        // Encode as JPEG
        const base64 = await temp.getBase64Async(Jimp.MIME_JPEG);
        stages.push(base64);
      }
    }

    cache[cacheKey] = stages;
    return stages;
  } catch (error) {
    console.error(`Failed to process image ${source}:`, error);
    throw error;
  }
}
