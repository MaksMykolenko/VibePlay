/**
 * Safe extraction of an already-validated archive into a temp directory.
 *
 * Defense in depth: even though zipValidator already rejected unsafe paths,
 * extraction re-resolves every target path against the destination root and
 * enforces a hard streaming byte budget (declared sizes are never trusted).
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { open as yauzlOpen, type Entry, type ZipFile } from 'yauzl';
import { checkArchivePath, isDirectoryEntry } from '@vibeplay/shared';

export interface ExtractedFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ExtractResult {
  files: ExtractedFile[];
  totalBytes: number;
  /** Deterministic hash over sorted (path, sha256) pairs. */
  contentHash: string;
}

class ByteBudget {
  private remaining: number;
  constructor(limit: number) {
    this.remaining = limit;
  }
  consume(n: number): void {
    this.remaining -= n;
    if (this.remaining < 0) {
      throw new Error('uncompressed byte budget exceeded during extraction (zip bomb?)');
    }
  }
}

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzlOpen(zipPath, { lazyEntries: true, decodeStrings: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('failed to open zip'));
      else resolve(zip);
    });
  });
}

export async function extractArchive(
  zipPath: string,
  destRoot: string,
  maxTotalBytes: number,
  maxSingleFileBytes: number,
): Promise<ExtractResult> {
  const zip = await openZip(zipPath);
  const budget = new ByteBudget(maxTotalBytes);
  const files: ExtractedFile[] = [];
  const resolvedRoot = path.resolve(destRoot);
  await mkdir(resolvedRoot, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        const check = checkArchivePath(entry.fileName);
        if (!check.ok) throw new Error(`unsafe path during extraction: ${check.reason}`);
        const rel = check.normalized!;

        if (isDirectoryEntry(rel)) {
          await mkdir(path.resolve(resolvedRoot, rel), { recursive: true });
          zip.readEntry();
          return;
        }

        const target = path.resolve(resolvedRoot, rel);
        if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
          throw new Error(`extraction escaped destination root: ${rel}`);
        }
        await mkdir(path.dirname(target), { recursive: true });

        const readStream = await new Promise<NodeJS.ReadableStream>((res, rej) => {
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) rej(err ?? new Error('failed to open entry stream'));
            else res(stream);
          });
        });

        const hash = createHash('sha256');
        let written = 0;
        const guard = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            written += chunk.length;
            if (written > maxSingleFileBytes) {
              cb(new Error(`file exceeded single-file budget during inflation: ${rel}`));
              return;
            }
            try {
              budget.consume(chunk.length);
            } catch (e) {
              cb(e as Error);
              return;
            }
            hash.update(chunk);
            cb(null, chunk);
          },
        });

        await pipeline(readStream, guard, createWriteStream(target, { flags: 'wx' }));
        files.push({ path: rel, size: written, sha256: hash.digest('hex') });
        zip.readEntry();
      })().catch((err) => {
        zip.close();
        reject(err as Error);
      });
    });
    zip.on('end', () => resolve());
    zip.on('error', (e) => reject(e));
    zip.readEntry();
  });

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const contentHasher = createHash('sha256');
  for (const f of files) contentHasher.update(`${f.path}\n${f.sha256}\n`);

  return {
    files,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    contentHash: contentHasher.digest('hex'),
  };
}
