import { S3Client } from '@aws-sdk/client-s3';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/**
 * Cliente S3 de los scripts, con las mismas variables de entorno que la app (`src/shared/lib/s3.ts`,
 * que no se puede importar desde un script: `server-only` y alias).
 */
export function createS3(): S3Client {
  return new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: requireEnv('S3_ACCESS_KEY'), secretAccessKey: requireEnv('S3_SECRET_KEY') },
  });
}
