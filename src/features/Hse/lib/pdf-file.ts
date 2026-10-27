import 'server-only';

import { createHash } from 'node:crypto';
import { HSE_PDF_MAX_BYTES } from './constants';

/** PDF validado en el servidor: el tipo que declara el navegador no alcanza, se miran los bytes. */
export type ValidatedPdf = { ok: true; file: File; sha256: string; size: number } | { ok: false; error: string };

const PDF_MAGIC = '%PDF-';

/** Valida el `file` de un FormData como PDF (firma `%PDF-`, tamaño) y calcula su huella SHA-256. */
export async function validatePdfUpload(value: FormDataEntryValue | null): Promise<ValidatedPdf> {
  if (!(value instanceof File) || value.size === 0) return { ok: false, error: 'Elegí el archivo PDF' };
  if (value.size > HSE_PDF_MAX_BYTES) return { ok: false, error: 'El PDF supera los 9 MB' };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, PDF_MAGIC.length));
  if (head !== PDF_MAGIC) return { ok: false, error: 'El archivo no es un PDF' };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Se re-arma el File con el tipo correcto: el que manda el navegador no es confiable.
  const file = new File([bytes], value.name, { type: 'application/pdf' });
  return { ok: true, file, sha256, size: value.size };
}

/** Key del archivo de una versión: la arma SIEMPRE el servidor, con la empresa adelante. */
export function hseVersionPath(companyId: string, documentId: string, versionId: string): string {
  return `${companyId}/documents/${documentId}/${versionId}.pdf`;
}

/** Nombre visible del archivo (el que se ofrece al descargar): sin rutas y con un largo razonable. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() || 'documento.pdf';
  const short = base.length > 120 ? base.slice(0, 116) : base;
  return short.toLowerCase().endsWith('.pdf') ? short : `${short}.pdf`;
}
