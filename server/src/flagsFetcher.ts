import { ImageRegistryItem } from './types';

/**
 * Generates an array of ImageRegistryItems for country flags using the official REST Countries v5 API.
 * Uses pagination to retrieve all available countries within free-tier limits (max 100 per request).
 */
export async function fetchCountryFlags(): Promise<ImageRegistryItem[]> {
  const flagsList: ImageRegistryItem[] = [];
  const apiKey = 'rc_live_fae4be25bf1244cabb2e798f85ddf45f';
  
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  try {
    console.log(`[Country Flags] Fetching all country flags from REST Countries API...`);
    
    while (hasMore) {
      const url = `https://api.restcountries.com/countries/v5?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`REST Countries API responded with status ${response.status}`);
      }

      const json = (await response.json()) as any;
      
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0].message);
      }

      const countries = json?.data?.objects || [];
      const meta = json?.data?.meta || {};

      for (const country of countries) {
        const name = country.names?.common;
        const url_png = country.flag?.url_png;
        const code = country.codes?.alpha_2?.toLowerCase();

        if (!name || !url_png || !code) continue;

        const nameLower = name.toLowerCase();
        const id = `flag_${code}`;

        flagsList.push({
          id,
          answer: name,
          aliases: [nameLower],
          category: 'Country Flags',
          fileName: url_png, // Provides the direct URL to the high-quality flag PNG
          hints: [
            'A national flag',
            `Country name has ${name.split(' ').length} words`,
            `Starts with the letter ${name.charAt(0)}`
          ],
          difficulty: 'easy'
        });
      }

      // Determine if more countries are available to fetch
      hasMore = meta.more === true && countries.length > 0;
      offset += limit;
    }

    console.log(`[Country Flags] Successfully loaded ${flagsList.length} country flags from REST API.`);
  } catch (error) {
    console.error(`[Country Flags] Failed to fetch flags from API:`, error);
  }

  return flagsList;
}
