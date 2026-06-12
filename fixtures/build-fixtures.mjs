import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { ZipFile } from 'yazl';

const fixturesRoot = path.dirname(fileURLToPath(import.meta.url));
const gamesRoot = path.join(fixturesRoot, 'games');
const outputRoot = path.join(fixturesRoot, 'generated');

async function listFiles(root, prefix = '') {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

async function writeZip(name, entries) {
  const zip = new ZipFile();
  for (const entry of entries) {
    zip.addBuffer(entry.contents, entry.name, { mode: 0o100644 });
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path.join(outputRoot, name)));
}

await mkdir(outputRoot, { recursive: true });

const helloRoot = path.join(gamesRoot, 'hello-vibeplay');
const helloFiles = await listFiles(helloRoot);
await writeZip(
  'hello-vibeplay.zip',
  await Promise.all(
    helloFiles.map(async (name) => ({
      name,
      contents: await readFile(path.join(helloRoot, name)),
    })),
  ),
);

await writeZip('missing-index.zip', [
  { name: 'build/game.js', contents: Buffer.from('console.log("missing root index")') },
]);
await writeZip('server-code.zip', [
  { name: 'index.html', contents: Buffer.from('<h1>Invalid fixture</h1>') },
  { name: 'server.php', contents: Buffer.from('<?php echo "not allowed";') },
]);

console.log(`Built fixtures in ${outputRoot}`);
