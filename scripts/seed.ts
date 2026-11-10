/**
 * Genera datos de ejemplo con el MISMO formato que followers_1.json de Instagram
 * y los importa a través del caso de uso real (así también se prueba el parser).
 *
 *   npm run seed            → 1 500 seguidores ficticios repartidos en 30 meses
 *   npm run seed -- 300     → cantidad personalizada
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bootstrap } from '../src/bootstrap.js';
import { PROJECT_ROOT } from '../src/config.js';

const ADJ = ['sunny', 'dark', 'cool', 'happy', 'lazy', 'wild', 'urban', 'retro', 'neon', 'quiet', 'fast', 'tiny'];
const NOUN = ['fox', 'river', 'pixel', 'coffee', 'moon', 'cactus', 'wave', 'tiger', 'cloud', 'vinyl', 'lemon', 'orbit'];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function fakeExport(count: number, seed = 42): unknown[] {
  const rand = rng(seed);
  const now = Date.now();
  const span = 30 * 30 * 24 * 3600 * 1000; // ~30 meses
  const seen = new Set<string>();
  const entries: unknown[] = [];
  while (entries.length < count) {
    const username = `${ADJ[Math.floor(rand() * ADJ.length)]}_${NOUN[Math.floor(rand() * NOUN.length)]}${Math.floor(rand() * 9999)}`;
    if (seen.has(username)) continue;
    seen.add(username);
    // Sesgo hacia fechas recientes, como una cuenta que crece.
    const ts = now - Math.floor(Math.pow(rand(), 1.6) * span);
    entries.push({
      title: '',
      media_list_data: [],
      string_list_data: [{ href: `https://www.instagram.com/${username}`, value: username, timestamp: Math.floor(ts / 1000) }],
    });
  }
  return entries;
}

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 1500);
  const doc = fakeExport(count);
  const samplePath = resolve(PROJECT_ROOT, 'samples', 'followers_1.json');
  await writeFile(samplePath, JSON.stringify(fakeExport(40, 7), null, 2));

  const { useCases, config, close } = bootstrap();
  try {
    const r = await useCases.importFollowers.execute([doc]);
    console.log(`Seed: ${r.parsed} seguidores → ${r.inserted} nuevos, ${r.updated} actualizados en ${config.databasePath}`);
    console.log(`Muestra escrita en ${samplePath}`);
  } finally {
    close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
