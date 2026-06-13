import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import type { UploadLimits } from '@vibeplay/shared';
import { checkZipSignature, validateArchive } from './zipValidator.js';

const limits: UploadLimits = {
  maxCompressedBytes: 1024 * 1024,
  maxUncompressedBytes: 1024 * 1024,
  maxFiles: 10,
  maxSingleFileBytes: 512 * 1024,
};

describe('ZIP archive validator', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'vibeplay-zip-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeZip(
    entries: Array<{ name: string; contents: string; mode?: number }>,
  ): Promise<string> {
    const file = path.join(dir, 'fixture.zip');
    const zip = new ZipFile();
    for (const entry of entries) {
      zip.addBuffer(Buffer.from(entry.contents), entry.name, {
        mode: entry.mode ?? 0o100644,
      });
    }
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(file));
    return file;
  }

  async function validate(file: string, customLimits = limits) {
    const bytes = await readFile(file);
    const size = (await stat(file)).size;
    return validateArchive(file, size, customLimits, bytes.subarray(0, 4));
  }

  async function markEntriesEncrypted(file: string) {
    const bytes = await readFile(file);
    for (let offset = 0; offset <= bytes.length - 10; offset++) {
      const signature = bytes.readUInt32LE(offset);
      const flagOffset =
        signature === 0x04034b50 ? offset + 6 : signature === 0x02014b50 ? offset + 8 : -1;
      if (flagOffset >= 0) {
        bytes.writeUInt16LE(bytes.readUInt16LE(flagOffset) | 0x1, flagOffset);
      }
    }
    await writeFile(file, bytes);
  }

  it('accepts a static game with root index.html', async () => {
    const file = await makeZip([
      { name: 'index.html', contents: '<script src="game.js"></script>' },
      { name: 'game.js', contents: 'console.log("ok")' },
    ]);
    await expect(validate(file)).resolves.toMatchObject({
      ok: true,
      fileCount: 2,
      entrypoint: 'index.html',
    });
  });

  it('rejects server-side executables and missing root entrypoints', async () => {
    const forbidden = await makeZip([
      { name: 'index.html', contents: 'ok' },
      { name: 'server.php', contents: '<?php' },
    ]);
    await expect(validate(forbidden)).resolves.toMatchObject({
      ok: false,
      failReason: expect.stringContaining('forbidden file type'),
    });

    const nested = await makeZip([{ name: 'build/index.html', contents: 'ok' }]);
    await expect(validate(nested)).resolves.toMatchObject({
      ok: false,
      failReason: 'archive must contain index.html at its root',
    });
  });

  it('rejects symlinks', async () => {
    const file = await makeZip([
      { name: 'index.html', contents: 'ok' },
      { name: 'shortcut.js', contents: 'game.js', mode: 0o120777 },
    ]);
    await expect(validate(file)).resolves.toMatchObject({
      ok: false,
      failReason: 'symlinks are not allowed in game builds',
    });
  });

  it('enforces declared compressed and uncompressed budgets', async () => {
    const file = await makeZip([{ name: 'index.html', contents: 'x'.repeat(100) }]);
    await expect(validate(file, { ...limits, maxCompressedBytes: 1 })).resolves.toMatchObject({
      ok: false,
      failReason: 'archive exceeds the compressed size limit',
    });
    await expect(validate(file, { ...limits, maxUncompressedBytes: 10 })).resolves.toMatchObject({
      ok: false,
      failReason: expect.stringContaining('zip bomb'),
    });
  });

  it('enforces single-file and file-count budgets', async () => {
    const oversized = await makeZip([{ name: 'index.html', contents: 'x'.repeat(100) }]);
    await expect(validate(oversized, { ...limits, maxSingleFileBytes: 10 })).resolves.toMatchObject(
      {
        ok: false,
        failReason: expect.stringContaining('single-file size limit'),
      },
    );

    const tooMany = await makeZip([
      { name: 'index.html', contents: 'ok' },
      { name: 'one.js', contents: '1' },
      { name: 'two.js', contents: '2' },
    ]);
    await expect(validate(tooMany, { ...limits, maxFiles: 2 })).resolves.toMatchObject({
      ok: false,
      failReason: 'archive contains too many files',
    });
  });

  it('rejects encrypted archives', async () => {
    const file = await makeZip([{ name: 'index.html', contents: 'protected' }]);
    await markEntriesEncrypted(file);
    await expect(validate(file)).resolves.toMatchObject({
      ok: false,
      failReason: 'encrypted/password-protected archives are not allowed',
    });
  });

  it('rejects corrupt archives even when the signature looks valid', async () => {
    const file = path.join(dir, 'corrupt.zip');
    await writeFile(file, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    await expect(validate(file)).resolves.toMatchObject({
      ok: false,
      failReason: 'archive is corrupt or not a valid ZIP',
    });
  });

  it('recognizes supported ZIP signatures', () => {
    expect(checkZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(checkZipSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(checkZipSignature(Buffer.from('not zip'))).toBe(false);
  });
});
