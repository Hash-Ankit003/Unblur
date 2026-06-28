import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ImageRegistryItem } from './types';

dotenv.config();

const DATASET_PATH = path.join(__dirname, 'data', 'dataset.json');

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

// Fetch Image from Wikipedia
async function resolveWikiImage(keyword: string, category: string): Promise<string> {
  const key = keyword.toLowerCase().trim();
  if (IMAGE_OVERRIDES[key]) {
    console.log(`[Wiki Resolve] Using override for "${keyword}": ${IMAGE_OVERRIDES[key]}`);
    return IMAGE_OVERRIDES[key];
  }

  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(keyword)}&redirects=true`;
  let retries = 2;
  
  while (retries >= 0) {
    try {
      const res = await fetch(wikiUrl, { headers: WIKI_HEADERS });
      if (res.status === 429) {
        console.warn(`[Wiki Resolve] 429 Rate limited for "${keyword}". Retrying in 3 seconds...`);
        await delay(3000);
        retries--;
        continue;
      }
      if (!res.ok) throw new Error(`Wiki responded with status ${res.status}`);
      const data = await res.json() as any;
      const pages = data?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const img = pages[pageId]?.original?.source;
        if (img && img.startsWith('http')) {
          return img;
        }
      }
      break;
    } catch (err) {
      console.warn(`[Wiki Resolve] Attempt failed for "${keyword}":`, err);
      retries--;
      if (retries >= 0) await delay(1000);
    }
  }

  // Fallback to LoremFlickr if Wiki fails
  const catTag = category.toLowerCase().replace(/[^a-z]/g, '');
  const qTag = keyword.toLowerCase().replace(/[^a-z0-9]/g, ',');
  return `https://loremflickr.com/640/480/${encodeURIComponent(catTag)},${encodeURIComponent(qTag)}/all`;
}

// Fetch members of a Wikipedia category
async function fetchWikiCategoryMembers(catTitle: string, limit: number): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(catTitle)}&cmlimit=${limit}&format=json&cmtype=page`;
  let retries = 2;
  
  while (retries >= 0) {
    try {
      const res = await fetch(url, { headers: WIKI_HEADERS });
      if (res.status === 429) {
        console.warn(`[Wiki Category] 429 Rate limited for "${catTitle}". Retrying in 3 seconds...`);
        await delay(3000);
        retries--;
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json() as any;
      const members = data?.query?.categorymembers || [];
      return members
        .map((m: any) => m.title as string)
        .filter((title: string) => {
          return !title.startsWith('List of') && !title.includes('list of') && !title.includes('Cricketers');
        })
        .map((title: string) => title.replace(/\s*\(.*\)/g, '').trim());
    } catch (err) {
      console.error(`[Wiki Category] Attempt failed for ${catTitle}:`, err);
      retries--;
      if (retries >= 0) await delay(1000);
    }
  }
  return [];
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
    for (let page = 1; page <= 4; page++) {
      const url = `https://api.jikan.moe/v4/top/characters?page=${page}`;
      const response = await fetch(url);

      if (response.status === 429) {
        console.warn(`[Anime] Rate limited. Waiting 3 seconds...`);
        await delay(3000);
        page--;
        continue;
      }

      if (!response.ok) throw new Error(`Jikan responded with status ${response.status}`);

      const json = await response.json() as any;
      const data = json.data || [];

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
      await delay(1000);
    }
  } catch (err) {
    console.error(`[Anime] Ingest failed:`, err);
  }
  return charactersList;
}

// Main Runner
async function runImporter() {
  console.log('🏁 Starting Master Offline Dataset Ingestion CLI...');

  // 1. Read existing dataset.json
  let registry: ImageRegistryItem[] = [];
  if (fs.existsSync(DATASET_PATH)) {
    try {
      registry = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
      console.log(`Loaded ${registry.length} existing items from dataset.json`);
    } catch (err) {
      console.error('Failed to parse existing dataset.json:', err);
    }
  }

  // Filter out any rebuilt categories to start clean
  const staticCategories = ['Animals', 'Landmarks', 'Logos', 'Scientists', 'Fruits & Veggies', 'Gaming & Pop Culture'];
  registry = registry.filter(item => staticCategories.includes(item.category));
  console.log(`Kept ${registry.length} static core items. Resolving missing image links...`);

  // 2. Resolve missing image URLs for core static items
  for (let i = 0; i < registry.length; i++) {
    const item = registry[i];
    if (!item.fileName || item.fileName.trim() === '') {
      console.log(`[Resolving Static] "${item.answer}" (${item.category})...`);
      item.fileName = await resolveWikiImage(item.answer, item.category);
      await delay(250); // avoid Wiki rate limiting
    }
  }

  // 3. Ingest Country Flags (REST Countries)
  const flags = await fetchCountryFlags();
  console.log(`[Importer] Ingested ${flags.length} Country Flags.`);
  registry.push(...flags);

  // 4. Ingest Anime Characters (Jikan)
  const anime = await fetchAnimeCharacters();
  console.log(`[Importer] Ingested ${anime.length} Anime Characters.`);
  registry.push(...anime);

  // 5. Ingest Cricketers
  const cricketersList = [
    'Virat Kohli', 'Sachin Tendulkar', 'MS Dhoni', 'Rohit Sharma',
    'Jasprit Bumrah', 'Kapil Dev', 'Sunil Gavaskar', 'Hardik Pandya',
    'Ravindra Jadeja', 'Chris Gayle', 'AB de Villiers', 'Shane Warne',
    'Ricky Ponting', 'Brian Lara', 'Muttiah Muralitharan', 'Wasim Akram',
    'Babar Azam', 'Steve Smith', 'Kane Williamson', 'Joe Root',
    'Ben Stokes', 'Pat Cummins', 'Mitchell Starc', 'Glenn Maxwell',
    'Rashid Khan', 'Lasith Malinga', 'Kumar Sangakkara', 'Mahela Jayawardene',
    'Shakib Al Hasan', 'Shoaib Akhtar'
  ];

  console.log(`[Cricketers] Ingesting famous international cricketers...`);
  for (const player of cricketersList) {
    const img = await resolveWikiImage(player, 'Cricketers');
    const lower = player.toLowerCase();
    registry.push({
      id: `cricketer_${lower.replace(/[^a-z0-9]/g, '_')}`,
      answer: player,
      aliases: [lower, player.split(' ').pop()!.toLowerCase()],
      category: 'Cricketers',
      fileName: img,
      hints: [
        'A famous international cricketer',
        `Name has ${player.split(' ').length} words`,
        `Starts with the letter ${player.charAt(0)}`
      ],
      difficulty: 'medium'
    });
    await delay(50);
  }

  // 6. Ingest Footballers
  const footballPlayers = [
    'Lionel Messi', 'Cristiano Ronaldo', 'Kylian Mbappe', 'Erling Haaland',
    'Neymar', 'Mohamed Salah', 'Kevin De Bruyne', 'Robert Lewandowski',
    'Luka Modric', 'Karim Benzema', 'Harry Kane', 'Ronaldinho',
    'Zinedine Zidane', 'Pele', 'Diego Maradona', 'David Beckham',
    'Thierry Henry', 'Zlatan Ibrahimovic', 'Luis Suarez', 'Antoine Griezmann'
  ];

  console.log(`[Footballers] Resolving player profile images...`);
  for (const player of footballPlayers) {
    const img = await resolveWikiImage(player, 'Footballers');
    const lower = player.toLowerCase();
    registry.push({
      id: `footballer_${lower.replace(/[^a-z0-9]/g, '_')}`,
      answer: player,
      aliases: [lower, player.split(' ').pop()!.toLowerCase()],
      category: 'Footballers',
      fileName: img,
      hints: [
        'A world-famous soccer/football player',
        `Name has ${player.split(' ').length} words`,
        `Starts with the letter ${player.charAt(0)}`
      ],
      difficulty: 'medium'
    });
    await delay(50);
  }

  // 7. Ingest Bollywood
  const bollywoodActors = [
    'Shah Rukh Khan', 'Amitabh Bachchan', 'Salman Khan', 'Aamir Khan',
    'Priyanka Chopra', 'Deepika Padukone', 'Ranbir Kapoor', 'Ranveer Singh',
    'Alia Bhatt', 'Hrithik Roshan', 'Katrina Kaif', 'Kareena Kapoor',
    'Akshay Kumar', 'Aishwarya Rai', 'Kajol'
  ];

  console.log(`[Bollywood] Resolving actor profile images...`);
  for (const actor of bollywoodActors) {
    const img = await resolveWikiImage(actor, 'Bollywood');
    const lower = actor.toLowerCase();
    registry.push({
      id: `bollywood_${lower.replace(/[^a-z0-9]/g, '_')}`,
      answer: actor,
      aliases: [lower],
      category: 'Bollywood',
      fileName: img,
      hints: [
        'A famous Bollywood actor/celebrity',
        `Name has ${actor.split(' ').length} words`,
        `Starts with the letter ${actor.charAt(0)}`
      ],
      difficulty: 'medium'
    });
    await delay(50);
  }

  // 8. Ingest Cars
  const iconicCars = [
    'Tesla Model S', 'Porsche 911', 'Ford Mustang', 'Chevrolet Corvette',
    'Jeep Wrangler', 'Toyota Prius', 'Ferrari LaFerrari', 'Lamborghini Aventador',
    'Aston Martin DB11', 'Bugatti Chiron', 'Honda Civic', 'Volkswagen Beetle',
    'Nissan GT-R', 'Range Rover', 'Audi R8'
  ];

  console.log(`[Cars] Resolving car concept designs...`);
  for (const car of iconicCars) {
    const img = await resolveWikiImage(car, 'Cars');
    const lower = car.toLowerCase();
    registry.push({
      id: `car_${lower.replace(/[^a-z0-9]/g, '_')}`,
      answer: car,
      aliases: [lower, car.split(' ').pop()!.toLowerCase()],
      category: 'Cars',
      fileName: img,
      hints: [
        'An iconic model of car',
        `Manufacturer starts with ${car.charAt(0)}`,
        `Full model name has ${car.split(' ').length} words`
      ],
      difficulty: 'easy'
    });
    await delay(50);
  }

  // 9. Ingest Monuments
  const monumentsList = [
    'Christ the Redeemer', 'Mount Rushmore', 'Gateway Arch',
    'Petra', 'Chichen Itza', 'Parthenon', 'Brandenburg Gate',
    'Leaning Tower of Pisa', 'Sagrada Familia', 'Angkor Wat',
    'Kremlin', 'Alhambra', 'Statue of Unity', 'Arc de Triomphe',
    'Empire State Building', 'Neuschwanstein Castle'
  ];

  console.log(`[Monuments] Resolving monument landmarks...`);
  for (const monument of monumentsList) {
    const img = await resolveWikiImage(monument, 'Monuments');
    const lower = monument.toLowerCase();
    registry.push({
      id: `monument_${lower.replace(/[^a-z0-9]/g, '_')}`,
      answer: monument,
      aliases: [lower],
      category: 'Monuments',
      fileName: img,
      hints: [
        'A world-famous historical monument or structure',
        `Name has ${monument.split(' ').length} words`,
        `Starts with the letter ${monument.charAt(0)}`
      ],
      difficulty: 'medium'
    });
    await delay(50);
  }

  // Post-process: Force apply overrides to all final items in the registry
  for (const item of registry) {
    const key = item.answer.toLowerCase().trim();
    if (IMAGE_OVERRIDES[key]) {
      console.log(`[Override Post-Process] Setting correct image for "${item.answer}": ${IMAGE_OVERRIDES[key]}`);
      item.fileName = IMAGE_OVERRIDES[key];
    }
  }

  // 10. Write registry to file
  console.log(`Writing master dataset to ${DATASET_PATH}...`);
  fs.writeFileSync(DATASET_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`✅ Master Offline Dataset Compilation Complete! Total registry size: ${registry.length} items.`);
}

runImporter().catch(err => {
  console.error('❌ Importer failed critically:', err);
});
