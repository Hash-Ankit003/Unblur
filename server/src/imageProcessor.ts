import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Cache for generated stages to avoid re-processing identical images
const cache: Record<string, string[]> = {};

/**
 * Downloads an image from a URL and returns it as a Buffer.
 * Uses a 15-second timeout to avoid hanging on slow/dead URLs.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'UnblurGame/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generates 10 stages of blurred/pixelated base64 JPEG data URIs for a given image.
 * Uses Sharp (native C++ via libvips) which is 10-50x faster than Jimp.
 * 
 * Stage 0 is the most blurred/pixelated (tiny image sent to client).
 * Stage 9 is the original crystal-clear image at full 384px.
 * 
 * The client renders stages 0-8 with CSS `image-rendering: pixelated`
 * so the browser GPU handles upscaling — zero server CPU cost.
 */
export async function generateBlurStages(source: string, publicFolder: string): Promise<string[]> {
  const cacheKey = source;
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const stages: string[] = [];

  try {
    let imageBuffer: Buffer;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      console.log(`[Processor] Downloading remote image: ${source}`);
      imageBuffer = await downloadImage(source);
    } else {
      const imagePath = path.join(publicFolder, 'images', source);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      console.log(`[Processor] Reading local image: ${imagePath}`);
      imageBuffer = fs.readFileSync(imagePath);
    }

    // Downscale source to max 384x384 and convert to a reusable JPEG buffer.
    // sharp() pipelines are single-use, so we create a normalized base buffer first.
    const normalizedBuffer = await sharp(imageBuffer)
      .resize(384, 384, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Stage configurations: size = target pixel width for downscale.
    // blur = Gaussian sigma applied AFTER downscale (on the tiny image).
    // -1 = send the full 384px clear image.
    const configurations = [
      { size: 24, blur: 1.5 },   // Stage 0: 24px - shapes and colors visible
      { size: 36, blur: 1.0 },   // Stage 1: 36px
      { size: 52, blur: 0.5 },   // Stage 2: 52px
      { size: 76, blur: 0 },     // Stage 3: 76px - facial features start to emerge
      { size: 104, blur: 0 },    // Stage 4: 104px
      { size: 140, blur: 0 },    // Stage 5: 140px
      { size: 186, blur: 0 },    // Stage 6: 186px
      { size: 240, blur: 0 },    // Stage 7: 240px
      { size: 300, blur: 0 },    // Stage 8: 300px
      { size: -1, blur: 0 },     // Stage 9: full 384px clear reveal
    ];

    for (let i = 0; i < configurations.length; i++) {
      // Yield to the event loop between stages so Socket.io stays responsive
      await new Promise<void>(resolve => setImmediate(resolve));

      const conf = configurations[i];

      if (conf.size === -1) {
        // Stage 9: send the full-resolution clear image
        const base64 = `data:image/jpeg;base64,${normalizedBuffer.toString('base64')}`;
        stages.push(base64);
      } else {
        // Build a Sharp pipeline: resize down → optional blur → JPEG encode
        let pipeline = sharp(normalizedBuffer)
          .resize(conf.size, conf.size, { fit: 'inside', withoutEnlargement: true });

        if (conf.blur > 0) {
          pipeline = pipeline.blur(conf.blur);
        }

        const buffer = await pipeline.jpeg({ quality: 70 }).toBuffer();
        const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
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
