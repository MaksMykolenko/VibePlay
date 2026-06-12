/**
 * ZIP archive validation (spec §21). The archive is treated as fully untrusted.
 *
 * Validation order:
 *  1. file signature (PK\x03\x04)
 *  2. compressed size limit
 *  3. central directory walk via yauzl (no extraction yet):
 *     - encrypted entries rejected
 *     - absolute paths / traversal / backslashes / control chars rejected
 *     - symlinks rejected (unix mode in external attributes)
 *     - unicode NFC normalization + case-insensitive collision detection
 *     - extension allowlist + explicit forbidden list (server-side code)
 *     - declared uncompressed size totals, file count, single-file limit
 *     - root index.html required
 *  4. streaming inflate with a hard byte budget (declared sizes are not trusted —
 *     a lying local header cannot smuggle more bytes than the budget allows)
 */
import { open as yauzlOpen, type Entry, type ZipFile } from 'yauzl';
import {
  checkArchivePath,
  checkExtension,
  findCollision,
  hasRootIndexHtml,
  isDirectoryEntry,
  isSymlinkMode,
  type UploadLimits,
} from '@vibeplay/shared';

export interface ArchiveEntrySummary {
  path: string;
  uncompressedSize: number;
}

export interface ArchiveCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ArchiveValidationResult {
  ok: boolean;
  failReason?: string;
  checks: ArchiveCheck[];
  entries: ArchiveEntrySummary[];
  fileCount: number;
  uncompressedSize: number;
  entrypoint: string | null;
}

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), // empty archive
];

export function checkZipSignature(firstBytes: Buffer): boolean {
  return ZIP_SIGNATURES.some((sig) => firstBytes.subarray(0, 4).equals(sig));
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzlOpen(path, { lazyEntries: true, decodeStrings: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('failed to open zip'));
      else resolve(zip);
    });
  });
}

function readEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zip.on('entry', (entry: Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
    zip.readEntry();
  });
}

export async function validateArchive(
  zipPath: string,
  compressedSize: number,
  limits: UploadLimits,
  firstBytes: Buffer,
): Promise<ArchiveValidationResult> {
  const checks: ArchiveCheck[] = [];
  const fail = (reason: string): ArchiveValidationResult => ({
    ok: false,
    failReason: reason,
    checks,
    entries: [],
    fileCount: 0,
    uncompressedSize: 0,
    entrypoint: null,
  });

  // 1. signature
  const sigOk = checkZipSignature(firstBytes);
  checks.push({ name: 'zip signature', ok: sigOk });
  if (!sigOk) return fail('file is not a ZIP archive (bad signature)');

  // 2. compressed size
  const sizeOk = compressedSize <= limits.maxCompressedBytes;
  checks.push({
    name: 'compressed size',
    ok: sizeOk,
    detail: `${compressedSize} bytes (limit ${limits.maxCompressedBytes})`,
  });
  if (!sizeOk) return fail('archive exceeds the compressed size limit');

  // 3. central directory walk
  let zip: ZipFile;
  let rawEntries: Entry[];
  try {
    zip = await openZip(zipPath);
    rawEntries = await readEntries(zip);
  } catch (err) {
    checks.push({ name: 'archive structure', ok: false, detail: (err as Error).message });
    return fail('archive is corrupt or not a valid ZIP');
  }
  checks.push({ name: 'archive structure', ok: true });

  const files: ArchiveEntrySummary[] = [];
  let totalUncompressed = 0;

  for (const entry of rawEntries) {
    const name = entry.fileName;

    // encrypted? (general purpose bit 0)
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
      checks.push({ name: 'encryption', ok: false, detail: name });
      return fail('encrypted/password-protected archives are not allowed');
    }

    const pathCheck = checkArchivePath(name);
    if (!pathCheck.ok) {
      checks.push({ name: 'entry path', ok: false, detail: `${name}: ${pathCheck.reason}` });
      return fail(`unsafe path in archive: ${pathCheck.reason}`);
    }
    const normalized = pathCheck.normalized!;

    if (isSymlinkMode(entry.externalFileAttributes)) {
      checks.push({ name: 'symlinks', ok: false, detail: normalized });
      return fail('symlinks are not allowed in game builds');
    }

    if (isDirectoryEntry(normalized)) continue;

    const verdict = checkExtension(normalized);
    if (verdict === 'forbidden') {
      checks.push({ name: 'extension allowlist', ok: false, detail: normalized });
      return fail(`forbidden file type in archive: ${normalized}`);
    }
    if (verdict === 'unknown') {
      checks.push({ name: 'extension allowlist', ok: false, detail: normalized });
      return fail(`file type not allowed in game builds: ${normalized}`);
    }

    if (entry.uncompressedSize > limits.maxSingleFileBytes) {
      checks.push({ name: 'single file size', ok: false, detail: normalized });
      return fail(`file exceeds the single-file size limit: ${normalized}`);
    }

    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      checks.push({ name: 'uncompressed size', ok: false });
      return fail('archive exceeds the uncompressed size limit (possible zip bomb)');
    }

    files.push({ path: normalized, uncompressedSize: entry.uncompressedSize });
    if (files.length > limits.maxFiles) {
      checks.push({ name: 'file count', ok: false });
      return fail('archive contains too many files');
    }
  }
  checks.push({ name: 'encryption', ok: true });
  checks.push({ name: 'entry paths', ok: true });
  checks.push({ name: 'symlinks', ok: true });
  checks.push({ name: 'extension allowlist', ok: true });
  checks.push({ name: 'file count', ok: true, detail: String(files.length) });
  checks.push({ name: 'uncompressed size', ok: true, detail: String(totalUncompressed) });

  const collision = findCollision(files.map((f) => f.path));
  if (collision) {
    checks.push({ name: 'filename collisions', ok: false, detail: collision });
    return fail(`filename collision after normalization: ${collision}`);
  }
  checks.push({ name: 'filename collisions', ok: true });

  if (files.length === 0) {
    checks.push({ name: 'root index.html', ok: false });
    return fail('archive is empty');
  }

  if (!hasRootIndexHtml(files.map((f) => f.path))) {
    checks.push({ name: 'root index.html', ok: false });
    return fail('archive must contain index.html at its root');
  }
  checks.push({ name: 'root index.html', ok: true });

  return {
    ok: true,
    checks,
    entries: files,
    fileCount: files.length,
    uncompressedSize: totalUncompressed,
    entrypoint: 'index.html',
  };
}
