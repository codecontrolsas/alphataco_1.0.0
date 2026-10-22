/**
 * Crea en el almacenamiento S3 (RustFS) los buckets que falten. Es idempotente: un bucket que ya existe no se toca.
 *
 * La lista sale de `STORAGE_BUCKETS` (única fuente de verdad, la misma que valida la app). Corre en
 * cada arranque del contenedor (ver `docker/entrypoint.sh`), así un bucket agregado en una versión
 * nueva se crea solo al desplegar. `scripts/dev-up.sh` lo corre en desarrollo, así que el compose no duplica la lista.
 *
 * Uso: node scripts/ensure-buckets.ts
 * Requiere S3_ENDPOINT, S3_ACCESS_KEY y S3_SECRET_KEY (S3_REGION y S3_FORCE_PATH_STYLE son opcionales,
 * con los mismos valores por defecto que `src/shared/lib/s3.ts`).
 *
 * No toca políticas: RustFS crea los buckets privados por defecto y la app es la única que los lee.
 * `CreateBucket` se manda sin `CreateBucketConfiguration`: con la región por defecto (`us-east-1`) alcanza; si
 * alguna vez se usa otra `S3_REGION`, hay que agregarle la restricción de ubicación.
 */
import { CreateBucketCommand, HeadBucketCommand, ListBucketsCommand, type S3Client } from '@aws-sdk/client-s3';
import { STORAGE_BUCKETS } from '../src/shared/lib/storage-buckets.ts';
import { createS3 } from './lib/s3-client.ts';

/**
 * Cuánto se espera a que el almacenamiento responda antes de rendirse. Se suma al arranque (migrate + seed) dentro del
 * `start-period` del HEALTHCHECK, por eso es corto.
 */
const WAIT_FOR_STORAGE_MS = 20_000;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type S3ErrorLike = { name?: string; $metadata?: { httpStatusCode?: number } };

/** `HeadBucket` responde 404 (`NotFound`) cuando el bucket no existe. */
function isMissingBucket(error: unknown): boolean {
  const { name, $metadata } = (error ?? {}) as S3ErrorLike;
  return name === 'NotFound' || name === 'NoSuchBucket' || $metadata?.httpStatusCode === 404;
}

/**
 * Espera a que el storage conteste. Solo reintenta lo transitorio (sin conexión todavía o error 5xx):
 * una respuesta 4xx (credenciales inválidas, por ejemplo) no se arregla esperando y falla enseguida.
 */
async function waitForStorage(s3: S3Client): Promise<void> {
  const deadline = Date.now() + WAIT_FOR_STORAGE_MS;
  for (;;) {
    try {
      await s3.send(new ListBucketsCommand({}));
      return;
    } catch (error) {
      const status = ((error ?? {}) as S3ErrorLike).$metadata?.httpStatusCode;
      const isPermanent = status !== undefined && status < 500;
      if (isPermanent || Date.now() >= deadline) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function ensureBucket(s3: S3Client, bucket: string): Promise<'exists' | 'created'> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return 'exists';
  } catch (error) {
    if (!isMissingBucket(error)) throw error;
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    return 'created';
  } catch (error) {
    // Otro proceso lo creó entre el HeadBucket y el CreateBucket: el resultado es el mismo.
    const { name } = (error ?? {}) as S3ErrorLike;
    if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return 'exists';
    throw error;
  }
}

async function main(): Promise<void> {
  const s3 = createS3();

  await waitForStorage(s3);

  const created: string[] = [];
  for (const bucket of STORAGE_BUCKETS) {
    if ((await ensureBucket(s3, bucket)) === 'created') created.push(bucket);
  }

  const existing = STORAGE_BUCKETS.length - created.length;
  console.log(`Buckets OK - created: [${created.join(', ')}] existing: ${existing}`);
}

main().catch((error: unknown) => {
  console.error('Error en ensure-buckets:', error);
  process.exit(1);
});
