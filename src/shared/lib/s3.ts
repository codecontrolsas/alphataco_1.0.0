import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cliente S3 contra RustFS. Módulo server-only: las credenciales nunca salen del servidor.
 *
 * Hay UN solo cliente y un solo endpoint (`S3_ENDPOINT`, `http://storage:9000` dentro de la
 * red de Docker) porque el navegador NUNCA habla con RustFS: todos los archivos se leen por
 * la ruta `/api/files/...` de la app, que valida el perímetro y hace stream.
 *
 * Antes había un segundo cliente para firmar URLs contra un endpoint público. Se eliminó
 * junto con las URLs firmadas: obligaba a publicar RustFS en internet con su propio dominio,
 * DNS y TLS, y a mantener dos variables sincronizadas a mano cuyo desfasaje rompía TODAS
 * las descargas con `SignatureDoesNotMatch` sin ningún aviso.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Endpoint de RustFS (sólo alcanzable desde el servidor). */
export function s3Endpoint(): string {
  return requireEnv('S3_ENDPOINT');
}

let client: S3Client | null = null;

/** Cliente para las operaciones del servidor (subir, bajar, listar, copiar, borrar). */
export function s3Client(): S3Client {
  client ??= new S3Client({
    endpoint: s3Endpoint(),
    region: process.env.S3_REGION || 'us-east-1',
    // RustFS no resuelve buckets por subdominio: el bucket va en el path.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY'),
      secretAccessKey: requireEnv('S3_SECRET_KEY'),
    },
  });
  return client;
}

/** Reinicia el cliente memoizado. Sólo para los tests. */
export function resetS3Clients(): void {
  client = null;
}
