#!/usr/bin/env node
/**
 * Importa seguidores desde una carpeta de exportación de Instagram ya descomprimida.
 * Busca recursivamente archivos followers*.json y followers*.html.
 *
 *   npm run import -- ~/Downloads/instagram-usuario-2026-11-10
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootstrap } from '../../../bootstrap.js';

async function findFollowerFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // Se ignora la carpeta de Threads: tiene su propio followers.html que no son seguidores de Instagram.
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() !== 'threads') out.push(...(await findFollowerFiles(path)));
    }
    else if (/^followers(_\d+)?\.(json|html)$/i.test(entry.name)) out.push(path);
  }
  return out.sort();
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: npm run import -- <carpeta-exportada | followers_1.json | followers_1.html>');
    process.exit(1);
  }

  const files = /\.(json|html)$/i.test(target) ? [target] : await findFollowerFiles(target);
  if (!files.length) {
    console.error(`No se encontraron archivos followers*.json ni followers*.html en ${target}`);
    process.exit(1);
  }

  const { useCases, close } = bootstrap();
  try {
    // Se envía el texto tal cual: el parser detecta si es JSON o HTML.
    const documents = await Promise.all(files.map((f) => readFile(f, 'utf8')));
    const result = await useCases.importFollowers.execute(documents);
    console.log(`Archivos: ${files.length}`);
    for (const f of files) console.log(`  - ${f}`);
    console.log(`Seguidores leídos: ${result.parsed} · nuevos: ${result.inserted} · actualizados: ${result.updated}`);
  } finally {
    close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
