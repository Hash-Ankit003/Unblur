import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ImageRegistryItem } from './types';

dotenv.config();

const DATASET_PATH = path.join(__dirname, 'data', 'dataset.json');
const PROPOSED_DATA_DIR = path.join(__dirname, 'data', 'proposed_data');

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Pre-compiled mapping for top anime characters to avoid rate limits
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

function cleanAnimeName(rawName: string, nicknames: string[]): { cleanName: string, aliases: string[] } {
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
  }

  return { cleanName, aliases: Array.from(new Set(aliases)) };
}

const WIKI_HEADERS = {
  'User-Agent': 'UnblurGameOfflineImporter/1.0 (contact@example.com)'
};

const IMAGE_OVERRIDES: Record<string, string> = {
  'amazon': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/640px-Amazon_logo.svg.png',
  'nike': 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg',
  'louis pasteur': 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Albert_Edelfelt_-_Louis_Pasteur_-_1885.jpg',
  'orange': 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Orange-Fruit-Pieces.jpg',
  'pikachu': 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Pikachu_in_Yokohama_2023.jpg',
  'charizard': 'https://upload.wikimedia.org/wikipedia/commons/d/de/Osaka_Pokemon_Center_1.JPG',
  'mario': 'https://upload.wikimedia.org/wikipedia/commons/2/22/Mario_Nintendo.jpg',
  'sonic': 'https://upload.wikimedia.org/wikipedia/commons/b/be/Sonic_the_Hedgehog_statue.jpg',
  'spider man': 'https://upload.wikimedia.org/wikipedia/commons/5/52/Spider-Man_in_Brussels.jpg',
  'batman': 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Batman_costume_replica.jpg',
  'link': 'https://upload.wikimedia.org/wikipedia/commons/8/87/Link_E3_2011.jpg',
  'donkey kong': 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Donkey_Kong_Nintendo.jpg',
  'master chief': 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Halo_Fest_2011_-_Master_Chief_%286088210344%29.jpg',
  'steve smith': 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Steve_Smith_at_Sydney_Cricket_Ground.jpg',
  'shakib al hasan': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Shakib_Al_Hasan_%28cropped%29.jpg',
  'christ the redeemer': 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Christ_the_Redeemer_-_Rio_de_Janeiro%2C_Brazil.jpg',
  'mount rushmore': 'https://upload.wikimedia.org/wikipedia/commons/1/16/Mount_Rushmore_National_Memorial_2017.jpg',
  'zlatan ibrahimovic': 'https://upload.wikimedia.org/wikipedia/commons/0/09/Zlatan_Ibrahimovi%C3%A7_June_2018.jpg',
  'nissan gt-r': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Nissan_GT-R_01.JPG',
  'range rover': 'https://upload.wikimedia.org/wikipedia/commons/4/4f/2018_Land_Rover_Range_Rover_Velar_R-Dynamic_HSE_D180_2.0_Front.jpg',
  'audi r8': 'https://upload.wikimedia.org/wikipedia/commons/1/1f/2018_Audi_R8_V10_Spyder_Sport_Edition_FSI_4.2_Front.jpg',
  'gateway arch': 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Gateway_Arch_under_clouds.jpg'
};

// Batch Wikipedia PageImages resolution
async function resolveWikiImagesBatch(titles: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  if (titles.length === 0) return results;

  const chunkSize = 50;
  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize);
    const titlesParam = chunk.map(t => encodeURIComponent(t)).join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${titlesParam}&redirects=true`;

    let retries = 3;
    while (retries >= 0) {
      try {
        const res = await fetch(url, { headers: WIKI_HEADERS });
        if (res.status === 429) {
          console.warn(`[Wiki Batch] 429 Rate limited. Waiting 4 seconds...`);
          await delay(4000);
          retries--;
          continue;
        }
        if (!res.ok) throw new Error(`Wiki batch responded with status ${res.status}`);
        const data = await res.json() as any;
        const pages = data?.query?.pages || {};
        const redirects = data?.query?.redirects || [];
        
        const normMap = new Map<string, string>();
        const normalized = data?.query?.normalized || [];
        for (const n of normalized) {
          normMap.set(n.to, n.from);
        }
        
        const redirectMap = new Map<string, string>();
        for (const r of redirects) {
          redirectMap.set(r.to, r.from);
        }
        
        for (const pageId in pages) {
          const page = pages[pageId];
          const title = page.title;
          const img = page?.original?.source;
          if (img && img.startsWith('http')) {
            let originalTitle = title;
            if (redirectMap.has(title)) {
              originalTitle = redirectMap.get(title)!;
            }
            if (normMap.has(originalTitle)) {
              originalTitle = normMap.get(originalTitle)!;
            }
            results[originalTitle.toLowerCase().trim()] = img;
          }
        }
        break;
      } catch (err: any) {
        console.warn(`[Wiki Batch] Error fetching chunk starting at ${i} (Retries left: ${retries}):`, err.message || err);
        retries--;
        if (retries >= 0) await delay(2000);
      }
    }
    await delay(150);
  }
  return results;
}

// Ingest Country Flags (from REST Countries)
async function fetchCountryFlags(): Promise<ImageRegistryItem[]> {
  const flagsList: ImageRegistryItem[] = [];
  const apiKey = 'rc_live_fae4be25bf1244cabb2e798f85ddf45f';
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  try {
    console.log(`[Country Flags] Fetching flags from REST Countries API...`);
    while (hasMore) {
      const url = `https://api.restcountries.com/countries/v5?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!response.ok) {
        throw new Error(`REST Countries API responded with status ${response.status}`);
      }

      const json = await response.json() as any;
      const countries = json?.data?.objects || [];
      const meta = json?.data?.meta || {};

      for (const country of countries) {
        const name = country.names?.common;
        const url_png = country.flag?.url_png;
        const code = country.codes?.alpha_2?.toLowerCase();

        if (!name || !url_png || !code) continue;

        flagsList.push({
          id: `flag_${code}`,
          answer: name,
          aliases: [name.toLowerCase()],
          category: 'Country Flags',
          fileName: url_png,
          hints: [
            'A national flag',
            `Country name has ${name.split(' ').length} words`,
            `Starts with the letter ${name.charAt(0)}`
          ],
          difficulty: 'easy'
        });
      }

      hasMore = meta.more === true && countries.length > 0;
      offset += limit;
      await delay(100);
    }
  } catch (err) {
    console.error(`[Country Flags] Ingest failed:`, err);
  }
  return flagsList;
}

// Ingest Anime Characters (Jikan)
async function fetchAnimeCharacters(): Promise<ImageRegistryItem[]> {
  const charactersList: ImageRegistryItem[] = [];
  const uniqueNames = new Set<string>();

  try {
    console.log(`[Anime] Fetching top characters from Jikan API...`);
    let page = 1;
    while (charactersList.length < 520 && page <= 30) {
      const url = `https://api.jikan.moe/v4/top/characters?page=${page}`;
      const response = await fetch(url);

      if (response.status === 429) {
        console.warn(`[Anime] Rate limited. Waiting 4 seconds...`);
        await delay(4000);
        continue;
      }

      if (!response.ok) throw new Error(`Jikan responded with status ${response.status}`);

      const json = await response.json() as any;
      const data = json.data || [];
      if (data.length === 0) break;

      for (const char of data) {
        const rawName = char.name;
        const imageUrl = char.images?.jpg?.image_url || char.images?.webp?.image_url;
        const malId = char.mal_id;

        if (!rawName || !imageUrl || imageUrl.includes('questionmark') || !malId) continue;

        const { cleanName, aliases } = cleanAnimeName(rawName, char.nicknames || []);
        const nameLower = cleanName.toLowerCase();
        if (uniqueNames.has(nameLower)) continue;
        uniqueNames.add(nameLower);

        const animeTitle = ANIME_MAP[malId] || 'a popular anime';
        charactersList.push({
          id: `anime_${malId}`,
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
      page++;
      await delay(1000);
    }
    console.log(`[Anime] Ingested ${charactersList.length} Anime Characters.`);
  } catch (err) {
    console.error(`[Anime] Ingest failed:`, err);
  }
  return charactersList;
}

function generateAliases(answer: string): string[] {
  const lower = answer.toLowerCase().trim();
  const aliases = new Set<string>([lower]);
  const parts = lower.split(/\s+/);
  if (parts.length > 1) {
    for (const part of parts) {
      if (part.length > 2) {
        aliases.add(part);
      }
    }
  }
  return Array.from(aliases);
}

function generateHints(answer: string, baseHint: string): string[] {
  const parts = answer.trim().split(/\s+/);
  return [
    baseHint,
    `Name has ${parts.length} word${parts.length > 1 ? 's' : ''}`,
    `Starts with the letter "${answer.trim().charAt(0).toUpperCase()}"`
  ];
}

function cleanId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Ingest a Category from proposed JSON files
async function ingestCategory(
  jsonFilename: string,
  categoryName: string,
  idPrefix: string,
  baseHint: string,
  urlCache: Map<string, string>
): Promise<ImageRegistryItem[]> {
  const filePath = path.join(PROPOSED_DATA_DIR, jsonFilename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[Importer] Proposed JSON file not found: ${filePath}`);
    return [];
  }

  const names: string[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`[Category Ingest: ${categoryName}] Loaded ${names.length} proposed items.`);

  const listToResolve: string[] = [];
  const items: ImageRegistryItem[] = [];

  // Identify names that need Wikipedia PageImages resolution
  for (const name of names) {
    const key = name.toLowerCase().trim();
    const cachedUrl = urlCache.get(key);
    if (cachedUrl && cachedUrl.startsWith('http')) {
      items.push({
        id: `${idPrefix}_${cleanId(name)}`,
        answer: name,
        aliases: generateAliases(name),
        category: categoryName,
        fileName: cachedUrl,
        hints: generateHints(name, baseHint),
        difficulty: 'medium'
      });
    } else {
      listToResolve.push(name);
    }
  }

  if (listToResolve.length > 0) {
    console.log(`[Category Ingest: ${categoryName}] Resolving ${listToResolve.length} items using Wikipedia PageImages Batch API...`);
    const batchResults = await resolveWikiImagesBatch(listToResolve);
    
    for (const name of listToResolve) {
      const key = name.toLowerCase().trim();
      let img = batchResults[key];
      if (!img || !img.startsWith('http')) {
        const catTag = categoryName.toLowerCase().replace(/[^a-z]/g, '');
        const qTag = name.toLowerCase().replace(/[^a-z0-9]/g, ',');
        img = `https://loremflickr.com/640/480/${encodeURIComponent(catTag)},${encodeURIComponent(qTag)}/all`;
      }

      items.push({
        id: `${idPrefix}_${cleanId(name)}`,
        answer: name,
        aliases: generateAliases(name),
        category: categoryName,
        fileName: img,
        hints: generateHints(name, baseHint),
        difficulty: 'medium'
      });
    }
  }

  console.log(`[Category Ingest: ${categoryName}] Completed with ${items.length} items.`);
  return items;
}

// Main Runner
async function runImporter() {
  console.log('🏁 Starting Master Offline Dataset Ingestion CLI...');

  // 1. Read existing dataset.json & populate cache
  const urlCache = new Map<string, string>();
  if (fs.existsSync(DATASET_PATH)) {
    try {
      const existing: ImageRegistryItem[] = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
      console.log(`Loaded ${existing.length} existing items from dataset.json for URL caching.`);
      for (const item of existing) {
        if (item.fileName && item.fileName.startsWith('http')) {
          urlCache.set(item.answer.toLowerCase().trim(), item.fileName);
        }
      }
    } catch (err) {
      console.error('Failed to parse existing dataset.json:', err);
    }
  }

  const registry: ImageRegistryItem[] = [];

  // 2. Ingest Country Flags (REST Countries)
  const flags = await fetchCountryFlags();
  console.log(`[Importer] Ingested ${flags.length} Country Flags.`);
  registry.push(...flags);

  // 3. Ingest Anime Characters (Jikan)
  const anime = await fetchAnimeCharacters();
  registry.push(...anime);

  // 4. Ingest Cricketers
  const cricketers = await ingestCategory(
    'proposed_cricketers.json',
    'Cricketers',
    'cricketer',
    'A famous international cricketer',
    urlCache
  );
  registry.push(...cricketers);

  // 5. Ingest Footballers
  const footballers = await ingestCategory(
    'proposed_footballers.json',
    'Footballers',
    'footballer',
    'A world-famous soccer/football player',
    urlCache
  );
  registry.push(...footballers);

  // 6. Ingest Bollywood
  const bollywood = await ingestCategory(
    'proposed_bollywood.json',
    'Bollywood',
    'bollywood',
    'A famous Bollywood actor/celebrity',
    urlCache
  );
  registry.push(...bollywood);

  // 7. Ingest Cars
  const cars = await ingestCategory(
    'proposed_cars.json',
    'Cars',
    'car',
    'An iconic model of car',
    urlCache
  );
  registry.push(...cars);

  // 8. Ingest Monuments
  const monuments = await ingestCategory(
    'proposed_monuments.json',
    'Monuments',
    'monument',
    'A famous historical monument or memorial',
    urlCache
  );
  registry.push(...monuments);

  // 9. Ingest Animals
  const animals = await ingestCategory(
    'proposed_animals.json',
    'Animals',
    'animal',
    'A wild or domestic animal',
    urlCache
  );
  registry.push(...animals);

  // 10. Ingest Logos
  const logos = await ingestCategory(
    'proposed_logos.json',
    'Logos',
    'logo',
    'A famous brand or company logo',
    urlCache
  );
  registry.push(...logos);

  // 11. Ingest Landmarks
  const landmarks = await ingestCategory(
    'proposed_landmarks.json',
    'Landmarks',
    'landmark',
    'A famous tourist attraction or landmark',
    urlCache
  );
  registry.push(...landmarks);

  // 12. Ingest Gaming & Pop Culture
  const gaming = await ingestCategory(
    'proposed_gaming.json',
    'Gaming & Pop Culture',
    'gaming',
    'A famous video game, character, or pop culture item',
    urlCache
  );
  registry.push(...gaming);

  // 13. Ingest Scientists
  const scientists = await ingestCategory(
    'proposed_scientists.json',
    'Scientists',
    'scientist',
    'A pioneering scientist or researcher',
    urlCache
  );
  registry.push(...scientists);

  // 14. Ingest Fruits & Veggies
  const fruitsVeggies = await ingestCategory(
    'proposed_fruits_veggies.json',
    'Fruits & Veggies',
    'fruit_veg',
    'A common fruit or vegetable',
    urlCache
  );
  registry.push(...fruitsVeggies);

  // Post-process: Force apply overrides to all final items in the registry
  for (const item of registry) {
    const key = item.answer.toLowerCase().trim();
    if (IMAGE_OVERRIDES[key]) {
      console.log(`[Override Post-Process] Setting correct image for "${item.answer}": ${IMAGE_OVERRIDES[key]}`);
      item.fileName = IMAGE_OVERRIDES[key];
    }
  }

  // 15. Write registry to file
  console.log(`Writing master dataset to ${DATASET_PATH}...`);
  fs.writeFileSync(DATASET_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`✅ Master Offline Dataset Compilation Complete! Total registry size: ${registry.length} items.`);
}

runImporter().catch(err => {
  console.error('❌ Importer failed critically:', err);
});
