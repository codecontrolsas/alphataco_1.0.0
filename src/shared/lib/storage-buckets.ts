/**
 * Buckets del storage. Única fuente de verdad: el `minio-init` del compose crea
 * exactamente esta lista (ver `docker-compose.yml`).
 *
 * Módulo PURO: lo importan la costura de storage, la ruta proxy y los tests.
 */

export const STORAGE_BUCKETS = [
  /** Archivos de los documentos de empleados, equipos y empresa. */
  'document-files',
  /** Copia archivada del documento anterior al renovarlo. */
  'document-files-expired',
  /** Archivos adjuntos de los contratos de clientes. */
  'contract-documents',
  /** Archivos de los remitos de los partes diarios. */
  'daily-reports',
  /** Logo de cada empresa. */
  'logo',
  /** Avatares de los perfiles. */
  'avatar',
  /** Firmas de las entregas de indumentaria. */
  'clothing-signatures',
  /** Fotos de las reparaciones de mantenimiento. */
  'repair-images',
  /** Fotos de descarte/reparación de cubiertas. */
  'tire-discards',
  /** Imagen adjunta del pedido de preparte. */
  'preparte-img',
  /** PDF fiscal de los comprobantes autorizados por ARCA (`<companyId>/<invoiceId>.pdf`). */
  'invoice-pdfs',
  /** Documentación de los proveedores de Compras (`<companyId>/<supplierId>/<archivo>`). */
  'supplier-documents',
  /** Certificados de retenciones sufridas de los clientes (`<companyId>/<customerId>/<archivo>`). */
  'customer-documents',
] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export function isStorageBucket(value: unknown): value is StorageBucket {
  return typeof value === 'string' && (STORAGE_BUCKETS as readonly string[]).includes(value);
}

/**
 * Buckets cuya key empieza SIEMPRE por el uuid de la empresa dueña del archivo
 * (`<companyId>/...`). El perímetro de lectura y de escritura sale del propio path, sin
 * consultar la base.
 *
 * `avatar` NO está: su dueño es un perfil, no una empresa. Colgarlo de la empresa le daba
 * un avatar por empresa a quien pertenece a varias, y 404 a los compañeros de la otra.
 */
export const COMPANY_PREFIXED_BUCKETS: readonly StorageBucket[] = [
  'logo',
  'clothing-signatures',
  'repair-images',
  'tire-discards',
  'preparte-img',
  'invoice-pdfs',
  'supplier-documents',
  'customer-documents',
];

export function isCompanyPrefixedBucket(bucket: string): bucket is StorageBucket {
  return (COMPANY_PREFIXED_BUCKETS as readonly string[]).includes(bucket);
}

/**
 * Buckets a los que el cliente puede pedir una subida por `uploadToStorage` (el archivo
 * viaja en un FormData desde el navegador). El resto sólo se escribe desde actions que
 * arman el path ellas mismas. En ambos casos la key la decide el servidor, nunca el cliente.
 */
export const CLIENT_UPLOAD_BUCKETS: readonly StorageBucket[] = ['avatar', 'preparte-img'];

export function isClientUploadBucket(bucket: string): bucket is StorageBucket {
  return (CLIENT_UPLOAD_BUCKETS as readonly string[]).includes(bucket);
}

/**
 * Forma de un uuid. Todo id que se saca de una key del storage se valida con esto antes de
 * llegar a Prisma: las columnas son `@db.Uuid` y un valor con otra forma lanza `P2023`.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empresa dueña de una key `<companyId>/...`, o `null` si el primer segmento no es un uuid. */
export function companyIdFromKey(path: string): string | null {
  const first = path.split('/')[0];
  return first && UUID_RE.test(first) ? first : null;
}
