import { ImageRegistryItem } from './types';

/**
 * Queries Wikipedia's Page Images API for a specific concept.
 * Returns the URL of the main article image if present.
 * Falls back to LoremFlickr if Wikipedia has no image or the request fails.
 */
export async function fetchImageUrl(item: ImageRegistryItem): Promise<string> {
  const keyword = item.answer;
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(keyword)}&redirects=true`;

  try {
    const response = await fetch(wikiUrl);
    if (!response.ok) {
      throw new Error(`Wikipedia API responded with status ${response.status}`);
    }

    const data = (await response.json()) as any;
    const pages = data?.query?.pages;

    if (pages) {
      const pageId = Object.keys(pages)[0];
      const imageUrl = pages[pageId]?.original?.source;
      
      if (imageUrl && imageUrl.startsWith('http')) {
        console.log(`[API] Successfully retrieved image from Wikipedia for: "${keyword}" -> ${imageUrl}`);
        return imageUrl;
      }
    }
    
    console.log(`[API] No page image on Wikipedia for: "${keyword}". Falling back to LoremFlickr...`);
  } catch (error) {
    console.warn(`[API] Wikipedia fetch failed for "${keyword}":`, error);
  }

  // Fallback: LoremFlickr searches Flickr for creative commons images of the keyword
  const categoryTag = item.category.toLowerCase().replace(/[^a-z]/g, '');
  const queryTag = keyword.toLowerCase().replace(/[^a-z0-9]/g, ',');
  
  // We can target specific queries for categories, e.g., animals, landmark
  const loremFlickrUrl = `https://loremflickr.com/640/480/${encodeURIComponent(categoryTag)},${encodeURIComponent(queryTag)}/all`;
  console.log(`[API] Using LoremFlickr fallback for: "${keyword}" -> ${loremFlickrUrl}`);
  return loremFlickrUrl;
}
