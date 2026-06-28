import { ImageRegistryItem } from './types';

/**
 * Queries Wikipedia's CategoryMembers API for cricketers from various countries.
 */
async function fetchFromWikipedia(): Promise<ImageRegistryItem[]> {
  const categories = [
    { title: 'Category:Indian_cricketers', limit: 40 },
    { title: 'Category:Australian_cricketers', limit: 25 },
    { title: 'Category:English_cricketers', limit: 25 },
    { title: 'Category:West_Indies_cricketers', limit: 20 }
  ];

  const cricketersList: ImageRegistryItem[] = [];
  const uniqueNames = new Set<string>();

  for (const cat of categories) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat.title)}&cmlimit=${cat.limit}&format=json&cmtype=page`;

    try {
      console.log(`[Cricketers] Ingesting members from Wikipedia category: ${cat.title}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Wikipedia responded with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const members = data?.query?.categorymembers || [];

      for (const member of members) {
        const rawName = member.title as string;

        if (
          rawName.startsWith('List of') ||
          rawName.includes('list of') ||
          rawName.includes('Cricketers')
        ) {
          continue;
        }

        const cleanName = rawName.replace(/\s*\(.*\)/g, '').trim();
        if (cleanName.length < 3) continue;

        const nameLower = cleanName.toLowerCase();
        if (uniqueNames.has(nameLower)) continue;
        uniqueNames.add(nameLower);

        const id = `cricketer_${nameLower.replace(/[^a-z0-9]/g, '_')}`;
        const hints = [
          'A famous international cricketer',
          `Name has ${cleanName.split(' ').length} words`,
          `First name starts with ${cleanName.charAt(0)}`
        ];

        cricketersList.push({
          id,
          answer: cleanName,
          aliases: [nameLower],
          category: 'Cricketers',
          fileName: '', // empty to trigger Wikipedia fetcher
          hints,
          difficulty: 'medium'
        });
      }
    } catch (error) {
      console.error(`[Cricketers] Wikipedia Ingest failed for category ${cat.title}:`, error);
    }
  }

  return cricketersList;
}

/**
 * Queries Sportmonks Cricket API for cricketers.
 */
async function fetchFromSportmonks(apiToken: string): Promise<ImageRegistryItem[]> {
  const cricketersList: ImageRegistryItem[] = [];
  const uniqueNames = new Set<string>();

  try {
    console.log(`[Cricketers] Fetching premium player images from Sportmonks API...`);
    // Example endpoint to get players from sportmonks
    const url = `https://cricket.sportmonks.com/api/v2.0/players?api_token=${apiToken}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Sportmonks responded with status ${response.status}`);
    }

    const json = (await response.json()) as any;
    const players = json.data || [];

    for (const player of players) {
      const cleanName = player.fullname;
      if (!cleanName || cleanName.length < 3) continue;

      const nameLower = cleanName.toLowerCase();
      if (uniqueNames.has(nameLower)) continue;
      uniqueNames.add(nameLower);

      const id = `cricketer_sm_${player.id || nameLower.replace(/[^a-z0-9]/g, '_')}`;
      const hints = [
        'A famous international cricketer',
        `Name has ${cleanName.split(' ').length} words`,
        `First name starts with ${cleanName.charAt(0)}`
      ];

      cricketersList.push({
        id,
        answer: cleanName,
        aliases: [nameLower],
        category: 'Cricketers',
        // If image_path exists, use it directly to bypass Wikipedia
        fileName: player.image_path || '', 
        hints,
        difficulty: 'medium'
      });
    }

  } catch (error) {
    console.error(`[Cricketers] Sportmonks API fetch failed:`, error);
    throw error; // Let caller fallback to wikipedia
  }

  return cricketersList;
}

/**
 * Loads cricketers into the game. Uses Sportmonks if API token is present,
 * otherwise falls back to Wikipedia.
 */
export async function fetchCricketersFromWikipedia(): Promise<ImageRegistryItem[]> {
  const sportmonksToken = process.env.SPORTMONKS_API_TOKEN;

  if (sportmonksToken && sportmonksToken.trim().length > 0) {
    try {
      const sportmonksPlayers = await fetchFromSportmonks(sportmonksToken.trim());
      if (sportmonksPlayers.length > 0) {
        console.log(`[Cricketers] Successfully loaded ${sportmonksPlayers.length} cricketers from Sportmonks!`);
        return sportmonksPlayers;
      }
    } catch (err) {
      console.warn(`[Cricketers] Falling back to Wikipedia due to Sportmonks error.`);
    }
  } else {
    console.log(`[Cricketers] No SPORTMONKS_API_TOKEN found in .env. Using free Wikipedia ingestion...`);
  }

  const wikiPlayers = await fetchFromWikipedia();
  console.log(`[Cricketers] Successfully loaded ${wikiPlayers.length} cricketers from Wikipedia.`);
  return wikiPlayers;
}
