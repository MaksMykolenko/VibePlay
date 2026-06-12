/**
 * Provider-neutral object storage (spec §6: do not couple app code to one provider).
 *
 * - `s3` driver: any S3-compatible service (MinIO, AWS S3, Cloudflare R2, Backblaze B2).
 * - `fs` driver: local filesystem for tests and lightweight development.
 *   Presigned uploads are NOT supported by the fs driver; the API falls back to
 *   a direct upload endpoint in that mode (development only).
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
  supported: boolean;
}

export interface ObjectStat {
  size: number;
  contentType?: string;
}

export interface ObjectStorage {
  readonly driver: 's3' | 'fs';
  putObject(
    bucket: string,
    key: string,
    body: Buffer | Readable,
    contentType?: string,
  ): Promise<void>;
  getObjectStream(bucket: string, key: string): Promise<Readable>;
  getObjectBuffer(bucket: string, key: string): Promise<Buffer>;
  /** Download an object to a local file path (streaming, no full buffering). */
  downloadToFile(bucket: string, key: string, filePath: string): Promise<void>;
  headObject(bucket: string, key: string): Promise<ObjectStat | null>;
  deleteObject(bucket: string, key: string): Promise<void>;
  presignPut(
    bucket: string,
    key: string,
    opts: {
      contentType: string;
      contentLength: number;
      expiresSeconds: number;
      publicEndpoint?: string;
    },
  ): Promise<PresignedUpload>;
  healthCheck(bucket: string): Promise<void>;
}

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function createS3Storage(cfg: S3StorageConfig): ObjectStorage {
  const createClient = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  const client = createClient(cfg.endpoint);
  const presignClients = new Map<string, S3Client>([[cfg.endpoint, client]]);
  const presignClient = (endpoint: string): S3Client => {
    const existing = presignClients.get(endpoint);
    if (existing) return existing;
    const created = createClient(endpoint);
    presignClients.set(endpoint, created);
    return created;
  };

  return {
    driver: 's3',
    async putObject(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getObjectStream(bucket, key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return res.Body as Readable;
    },
    async getObjectBuffer(bucket, key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    async downloadToFile(bucket, key, filePath) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(res.Body as Readable, createWriteStream(filePath));
    },
    async headObject(bucket, key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (err) {
        if ((err as { name?: string }).name === 'NotFound') return null;
        throw err;
      }
    },
    async deleteObject(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async presignPut(bucket, key, opts) {
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: opts.contentType,
        ContentLength: opts.contentLength,
      });
      // The Host header is part of SigV4. Sign with the browser-visible
      // endpoint directly instead of rewriting an internally signed URL.
      const endpoint = opts.publicEndpoint ?? cfg.endpoint;
      const url = await getSignedUrl(presignClient(endpoint), cmd, {
        expiresIn: opts.expiresSeconds,
      });
      return {
        url,
        method: 'PUT',
        headers: { 'content-type': opts.contentType },
        expiresAt: new Date(Date.now() + opts.expiresSeconds * 1000),
        supported: true,
      };
    },
    async healthCheck(bucket) {
      // HeadObject on a key that may not exist still validates connectivity/auth.
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: '.health' }));
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === 'NotFound') return; // bucket reachable
        throw err;
      }
    },
  };
}

export function createFsStorage(rootDir: string): ObjectStorage {
  const resolveKey = (bucket: string, key: string): string => {
    const full = path.resolve(rootDir, bucket, key);
    const base = path.resolve(rootDir, bucket);
    if (!full.startsWith(base + path.sep) && full !== base) {
      throw new Error(`fs storage: key escapes bucket root: ${key}`);
    }
    return full;
  };

  return {
    driver: 'fs',
    async putObject(bucket, key, body, _contentType) {
      const file = resolveKey(bucket, key);
      await mkdir(path.dirname(file), { recursive: true });
      if (Buffer.isBuffer(body)) {
        await writeFile(file, body);
      } else {
        await pipeline(body, createWriteStream(file));
      }
    },
    async getObjectStream(bucket, key) {
      const file = resolveKey(bucket, key);
      await stat(file); // throws ENOENT like S3 NoSuchKey
      return createReadStream(file);
    },
    async getObjectBuffer(bucket, key) {
      return readFile(resolveKey(bucket, key));
    },
    async downloadToFile(bucket, key, filePath) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(createReadStream(resolveKey(bucket, key)), createWriteStream(filePath));
    },
    async headObject(bucket, key) {
      try {
        const s = await stat(resolveKey(bucket, key));
        return { size: s.size };
      } catch {
        return null;
      }
    },
    async deleteObject(bucket, key) {
      await rm(resolveKey(bucket, key), { force: true });
    },
    async presignPut(_bucket, _key, opts) {
      return {
        url: '',
        method: 'PUT',
        headers: {},
        expiresAt: new Date(Date.now() + opts.expiresSeconds * 1000),
        supported: false,
      };
    },
    async healthCheck(bucket) {
      await mkdir(path.resolve(rootDir, bucket), { recursive: true });
    },
  };
}

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}
