import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

// Path traversal: yazl (correctly) refuses '..' entry names, so build a valid
// zip with a same-length placeholder path and rewrite the bytes afterwards —
// exactly the kind of hand-crafted archive an attacker would upload.
{
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from('<h1>traversal fixture</h1>'), 'index.html', { mode: 0o100644 });
  zip.addBuffer(Buffer.from('console.log("escape attempt")'), 'AA/BB/evil.js', {
    mode: 0o100644,
  });
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  let bytes = Buffer.concat(chunks);
  // 'AA/BB' and '../..' are the same byte length, so headers stay consistent.
  bytes = Buffer.from(bytes.toString('latin1').replaceAll('AA/BB', '../..'), 'latin1');
  await writeFile(path.join(outputRoot, 'traversal.zip'), bytes);
}

// Corrupt archive: a ZIP signature followed by garbage.
await writeFile(
  path.join(outputRoot, 'corrupt.zip'),
  Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('this is not a real zip archive at all')]),
);

console.log(`Built fixtures in ${outputRoot}`);
