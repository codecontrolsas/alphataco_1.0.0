import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { NextResponse, connection } from 'next/server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { s3Client } from '@/shared/lib/s3';
import { STORAGE_BUCKETS } from '@/shared/lib/storage-buckets';

const logger = new Logger('api/health');

/**
 * Commit con el que se construyó esta imagen. Lo inyecta el build de Docker (`ARG GIT_SHA`).
 *
 * Sirve para que el deploy sepa si ya está respondiendo el contenedor nuevo: el contenedor
 * viejo también responde "ok", así que sin el commit el chequeo de readiness daría verde antes
 * de que la versión nueva llegue a existir.
 */
const GIT_SHA = process.env.GIT_SHA || null;

type StorageStatus = 'ok' | 'error';

/**
 * El HEALTHCHECK del Dockerfile pega cada pocos segundos: el storage se consulta como mucho una vez por
 * minuto. Un error se recuerda menos (10 s) para que un fallo pasajero (cliente en frío, RustFS arrancando)
 * no deje el deploy en rojo por un minuto entero.
 */
const STORAGE_OK_TTL_MS = 60_000;
const STORAGE_ERROR_TTL_MS = 10_000;
const STORAGE_CHECK_TIMEOUT_MS = 2_000;

let lastStorageCheck: { at: number; status: StorageStatus } | null = null;

/**
 * Estado del storage: un `HeadBucket` sobre el primer bucket, con timeout corto y resultado cacheado.
 *
 * Es informativo y NO cambia el código HTTP: si RustFS cayera y el health devolviera 503, el HEALTHCHECK
 * de Docker reiniciaría el contenedor y la web dejaría de funcionar por algo que solo afecta las subidas.
 * El workflow de deploy lee este campo y deja el deploy en rojo (`_deploy.yml`).
 */
async function checkStorage(): Promise<StorageStatus> {
  const now = Date.now();
  if (lastStorageCheck) {
    const ttl = lastStorageCheck.status === 'ok' ? STORAGE_OK_TTL_MS : STORAGE_ERROR_TTL_MS;
    if (now - lastStorageCheck.at < ttl) return lastStorageCheck.status;
  }

  let status: StorageStatus = 'ok';
  try {
    await s3Client().send(new HeadBucketCommand({ Bucket: STORAGE_BUCKETS[0] }), {
      abortSignal: AbortSignal.timeout(STORAGE_CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn('Health check sin acceso al storage', { data: { error } });
    status = 'error';
  }
  lastStorageCheck = { at: now, status };
  return status;
}

/**
 * Health check del contenedor y del deploy (docs/deploy/runbook.md). Es la única API route que
 * no es un endpoint de negocio: la consumen el HEALTHCHECK del Dockerfile y el workflow de
 * deploy, que no pueden llamar Server Actions. No requiere sesión: el proxy de auth sólo cubre
 * /dashboard/*.
 */
export async function GET() {
  // Con cacheComponents, un GET que no lee el request se prerenderiza en el build. Esto lo
  // fuerza a responder en cada request (y a no tocar la base durante `next build`).
  await connection();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error('Health check sin conexión a la base de datos', { data: { error } });
    return NextResponse.json({ status: 'db_unavailable', sha: GIT_SHA }, { status: 503 });
  }

  const storage = await checkStorage();
  return NextResponse.json({ status: 'ok', sha: GIT_SHA, storage }, { status: 200 });
}
