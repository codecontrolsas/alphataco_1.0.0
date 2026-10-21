/**
 * Subida de los archivos de la demo a RustFS. Mismas variables de entorno que la app
 * (`src/shared/lib/s3.ts`), que no se puede importar desde un script (`server-only`, alias).
 */
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import type { DemoFile } from './ctx.ts';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function createS3(): S3Client {
  return new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: requireEnv('S3_ACCESS_KEY'), secretAccessKey: requireEnv('S3_SECRET_KEY') },
  });
}

export async function ensureBuckets(s3: S3Client, buckets: string[]): Promise<void> {
  for (const bucket of buckets) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
}

/** Sube en paralelo con un tope de concurrencia. */
export async function uploadAll(s3: S3Client, files: DemoFile[], concurrency = 12): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      await s3.send(
        new PutObjectCommand({ Bucket: file.bucket, Key: file.key, Body: file.body, ContentType: file.contentType })
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}

/**
 * Borra de los buckets los objetos que ya no pertenecen a la demo (las keys llevan la fecha de
 * vencimiento, que cambia todos los dias). Solo mira los prefijos de la demo.
 */
export async function pruneObjects(s3: S3Client, keep: DemoFile[], prefixes: Array<{ bucket: string; prefix: string }>): Promise<number> {
  const keepKeys = new Set(keep.map((f) => `${f.bucket}/${f.key}`));
  let removed = 0;
  for (const { bucket, prefix } of prefixes) {
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const stale = (page.Contents ?? []).filter((o) => o.Key && !keepKeys.has(`${bucket}/${o.Key}`));
      if (stale.length) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map((o) => ({ Key: o.Key! })) } }));
        removed += stale.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  return removed;
}
