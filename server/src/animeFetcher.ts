import { ImageRegistryItem } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Pre-compiled mapping for the top 50 most popular anime characters to avoid extra API hits on startup
const ANIME_MAP: Record<number, string> = {
  417: 'Code Geass',
  40: 'One Piece',
  45627: 'Attack on Titan',
  71: 'Death Note',
  62: 'One Piece',
  27: 'Hunter x Hunter',
  35252: 'Steins;Gate',
  80: 'Death Note',
  11: 'Fullmetal Alchemist',
  17: 'Naruto',
  422: 'Berserk',
  672: 'Gintama',
  40882: 'Attack on Titan',
  34470: 'Steins;Gate',
  14: 'Naruto',
  164471: 'Jujutsu Kaisen',
  40881: 'Attack on Titan',
  87275: 'Tokyo Ghoul',
  67065: 'My Teen Romantic Comedy SNAFU',
  85: 'Naruto',
  1: 'Cowboy Bebop',
  73935: 'One Punch Man',
  118763: 'Re:Zero',
  6356: "JoJo's Bizarre Adventure",
  117225: 'KonoSuba',
  109931: 'Mob Psycho 100',
  22037: 'Monogatari Series',
  36765: 'Sword Art Online',
  118739: 'Rascal Does Not Dream of Bunny Girl Senpai',
  141354: 'Violet Evergarden',
  68: 'Fullmetal Alchemist',
  84677: 'Noragami',
  155679: 'Darling in the Franxx',
  5: 'Bleach',
  128909: 'Classroom of the Elite',
  125056: 'Bungou Stray Dogs',
  10138: 'Vinland Saga',
  31: 'Hunter x Hunter',
  2075: 'Tengen Toppa Gurren Lagann',
  434: 'Great Teacher Onizuka',
  497: 'Fate/stay night',
  23602: 'Monogatari Series',
  305: 'One Piece',
  184947: "Frieren: Beyond Journey's End",
  12064: 'Toradora!',
  94: 'Neon Genesis Evangelion',
  22036: 'Monogatari Series',
  246: 'Dragon Ball Z',
  13020: 'Vinland Saga',
  13: 'Naruto'
};

/**
 * Normalizes an anime character name from Jikan's format (often Last, First or inverted)
 * into a clean guessable format, and generates common aliases.
 */
function generateAliasesAndCleanName(rawName: string, nicknames: string[]): { cleanName: string, aliases: string[] } {
  let cleanName = rawName.replace(/,/g, '').trim();
  const parts = cleanName.split(/\s+/);
  const aliases: string[] = [cleanName.toLowerCase()];

  for (const nick of nicknames) {
    aliases.push(nick.toLowerCase());
  }

  if (parts.length > 1) {
    for (const part of parts) {
      if (part.length > 2) {
        aliases.push(part.toLowerCase());
      }
    }

    const reversed = [...parts].reverse().join(' ');
    aliases.push(reversed.toLowerCase());

    if (cleanName.includes('Monkey D.')) {
      aliases.push('monkey d luffy');
      aliases.push('monkey d. luffy');
      aliases.push('luffy');
    }
    if (cleanName.includes('Uzumaki')) {
      aliases.push('naruto');
      aliases.push('naruto uzumaki');
    }
    if (cleanName.includes('Uchiha')) {
      if (cleanName.toLowerCase().includes('sasuke')) aliases.push('sasuke');
      if (cleanName.toLowerCase().includes('itachi')) aliases.push('itachi');
      if (cleanName.toLowerCase().includes('madara')) aliases.push('madara');
    }
    if (cleanName.includes('Lawliet')) {
      aliases.push('l');
    }
  }

  return {
    cleanName,
    aliases: Array.from(new Set(aliases))
  };
}

/**
 * Fetches the anime title for a character. Checks local map first, then makes API call if missing.
 */
async function getAnimeTitleForCharacter(malId: number): Promise<string> {
  if (ANIME_MAP[malId]) {
    return ANIME_MAP[malId];
  }

  try {
    // Fallback dynamic lookup (runs with a delay between calls when populated)
    const url = `https://api.jikan.moe/v4/characters/${malId}/full`;
    const response = await fetch(url);
    if (!response.ok) return 'a popular anime';

    const json = (await response.json()) as any;
    const animeTitle = json.data?.anime?.[0]?.anime?.title;
    return animeTitle || 'a popular anime';
  } catch (error) {
    return 'a popular anime';
  }
}

/**
 * Fetches top anime characters from Jikan API.
 * Feeds pages 1-4 (100 characters total) with a 1-second delay between requests to avoid rate limits.
 */
export async function fetchAnimeCharacters(): Promise<ImageRegistryItem[]> {
  const charactersList: ImageRegistryItem[] = [];
  const uniqueNames = new Set<string>();

  try {
    console.log(`[Anime] Fetching top anime characters from Jikan API...`);
    
    for (let page = 1; page <= 4; page++) {
      const url = `https://api.jikan.moe/v4/top/characters?page=${page}`;
      const response = await fetch(url);
      
      if (response.status === 429) {
        console.warn(`[Anime] Rate limited (429) on page ${page}. Waiting 3 seconds...`);
        await delay(3000);
        page--; // Retry this page
        continue;
      }

      if (!response.ok) {
        throw new Error(`Jikan API responded with status ${response.status}`);
      }

      const json = (await response.json()) as any;
      const data = json.data || [];

      for (const char of data) {
        const rawName = char.name;
        const imageUrl = char.images?.jpg?.image_url || char.images?.webp?.image_url;
        const malId = char.mal_id;

        if (!rawName || !imageUrl || imageUrl.includes('questionmark') || !malId) continue;

        const { cleanName, aliases } = generateAliasesAndCleanName(rawName, char.nicknames || []);
        const nameLower = cleanName.toLowerCase();

        if (uniqueNames.has(nameLower)) continue;
        uniqueNames.add(nameLower);

        // Fetch anime title for hints (mostly instant due to pre-compiled map)
        const animeTitle = await getAnimeTitleForCharacter(malId);
        
        // If it wasn't in our map, wait 1s to avoid rate limiting before the next API fallback call
        if (!ANIME_MAP[malId]) {
          await delay(1000);
        }

        const id = `anime_${malId}`;

        charactersList.push({
          id,
          answer: cleanName,
          aliases,
          category: 'Anime',
          fileName: imageUrl,
          hints: [
            'A famous anime character',
            `Appears in the anime: ${animeTitle}`,
            `Name has ${cleanName.split(' ').length} words`,
            `Starts with the letter ${cleanName.charAt(0)}`
          ],
          difficulty: 'medium'
        });
      }

      if (page < 4) {
        await delay(1000);
      }
    }

    console.log(`[Anime] Successfully loaded ${charactersList.length} anime characters.`);
  } catch (error) {
    console.error(`[Anime] Failed to fetch anime characters:`, error);
  }

  return charactersList;
}
