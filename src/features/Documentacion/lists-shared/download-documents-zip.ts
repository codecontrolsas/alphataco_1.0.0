'use client';

import { getDocumentDownloadUrls } from '@/features/Documentacion/shared/actions/document-files.server';

/** Un documento a incluir en el ZIP. `id` es el de la fila (distingue períodos y recursos de un mismo documento). */
export interface ZipDocument {
  id: string;
  path: string;
  /** Recurso + tipo de documento, ej. `Perez_Juan-(DNI)`. */
  baseName: string;
  period?: string | null;
}

export interface ZipResult {
  /** Documentos que quedaron dentro del ZIP. */
  added: number;
  /** Documentos que no se pudieron descargar (se omitieron, el ZIP se generó igual). */
  failed: number;
}

/** El servidor resuelve hasta 500 enlaces por llamada. */
const URL_CHUNK_SIZE = 500;
/** Descargas simultáneas: más saturan el navegador y el storage. */
const DOWNLOAD_CONCURRENCY = 5;

const INVALID_FILE_CHARS = /[\\/:*?"<>|]+/g;

function extensionOf(path: string) {
  const last = path.split('/').pop() ?? '';
  return last.includes('.') ? last.split('.').pop() ?? 'bin' : 'bin';
}

/**
 * Nombre único dentro del ZIP: incluye el período y un id corto de la fila, porque el mismo recurso y
 * documento se repite entre períodos (mensuales) y entre recursos (multirecurso) y JSZip pisaría el archivo.
 */
function uniqueEntryName(doc: ZipDocument, taken: Set<string>) {
  const period = doc.period ? `-(${doc.period})` : '';
  const shortId = doc.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const base = `${doc.baseName}${period}-${shortId}`.replace(INVALID_FILE_CHARS, '_');
  const extension = extensionOf(doc.path);
  let name = `${base}.${extension}`;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}.${extension}`;
  taken.add(name);
  return name;
}

/** Ejecuta `worker` sobre los items con a lo sumo `limit` en vuelo a la vez. */
async function runPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Descarga los documentos y los guarda en un ZIP. Tolera fallos individuales: los que no se pueden
 * bajar se omiten y se informan en `failed`. Lanza sólo si no quedó ningún documento. `jszip` y
 * `file-saver` se cargan recién al descargar.
 */
export async function downloadDocumentsZip(documents: readonly ZipDocument[], zipFileName: string): Promise<ZipResult> {
  const [{ default: JSZip }, { saveAs }] = await Promise.all([import('jszip'), import('file-saver')]);

  // Las URLs las resuelve el servidor (sólo documentos de la empresa activa que el usuario puede ver).
  const paths = [...new Set(documents.map((doc) => doc.path))];
  const urls = new Map<string, string>();
  for (let start = 0; start < paths.length; start += URL_CHUNK_SIZE) {
    const resolved = await getDocumentDownloadUrls(paths.slice(start, start + URL_CHUNK_SIZE));
    for (const item of resolved) urls.set(item.path, item.url);
  }

  const zip = new JSZip();
  const taken = new Set<string>();
  let added = 0;
  let failed = 0;

  await runPool(documents, DOWNLOAD_CONCURRENCY, async (doc) => {
    try {
      const url = urls.get(doc.path);
      if (!url) throw new Error('Sin enlace de descarga');
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo descargar el documento');
      zip.file(uniqueEntryName(doc, taken), await response.blob());
      added++;
    } catch {
      failed++;
    }
  });

  if (added === 0) throw new Error('No se pudo descargar ningún documento');
  saveAs(await zip.generateAsync({ type: 'blob' }), zipFileName);
  return { added, failed };
}
