import 'server-only';

import { Logger } from '@/lib/logger';
import { storageDownload } from '@/shared/lib/storage';
import { isSafeStorageKey, parseStorageFileUrl } from '@/shared/lib/storage-url';
import type { PdfCompanySource, PdfDownload, PdfLogo, ReactPdf, RenderedPdf } from './types';

const logger = new Logger('shared/lib/pdf');

/**
 * Ver `render-invoice-pdf.server.ts`: react-pdf se resuelve desde node_modules, fuera del bundle
 * (con el React `react-server` de Next su reconciler falla).
 */
export function loadReactPdf(): Promise<ReactPdf> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@react-pdf/renderer');
}

/** Datos de la empresa emisora que lleva el membrete de los PDF. */
export const COMPANY_SELECT = {
  company_name: true,
  company_cuit: true,
  address: true,
  company_logo: true,
  cities: { select: { name: true } },
  provinces: { select: { name: true } },
} as const;

type CompanyRow = {
  company_name: string;
  company_cuit: string;
  address: string;
  cities: { name: string } | null;
  provinces: { name: string } | null;
};

export function companySource(company: CompanyRow): PdfCompanySource {
  return {
    name: company.company_name,
    cuit: company.company_cuit,
    address: company.address,
    city: company.cities?.name ?? null,
    province: company.provinces?.name ?? null,
  };
}

/**
 * Logo de la empresa leído directo de RustFS (la URL guardada apunta al proxy `/api/files`, que
 * pide sesión). Si no se puede leer, el PDF sale sin logo: nunca se cae por eso.
 */
export async function loadCompanyLogo(logoUrl: string | null): Promise<PdfLogo> {
  if (!logoUrl) return null;
  const parsed = parseStorageFileUrl(logoUrl);
  if (!parsed || !isSafeStorageKey(parsed.path)) return null;
  const extension = parsed.path.split('.').pop()?.toLowerCase();
  const format = extension === 'png' ? 'png' : extension === 'jpg' || extension === 'jpeg' ? 'jpg' : null;
  if (!format) return null;
  const downloaded = await storageDownload(parsed.bucket, parsed.path);
  if (!downloaded.ok) {
    logger.warn('No se pudo leer el logo de la empresa: el PDF sale sin logo', { data: { path: parsed.path } });
    return null;
  }
  return { data: Buffer.from(await downloaded.data.arrayBuffer()), format };
}

/** PDF renderizado → lo que devuelve la action de descarga. */
export function toPdfDownload(pdf: RenderedPdf): PdfDownload {
  return { filename: pdf.filename, base64: Buffer.from(pdf.content).toString('base64') };
}
