import 'server-only';

import { formatDateAr } from '@/shared/lib/argentina-time';
import { appUrl, renderActionEmail } from '../shell';
import type { RenderedEmail } from './purchases';

/**
 * Correos de HSE que no son del job de vencimientos (esos viven en `features/Jobs/templates/hse-expiry.ts`):
 * al EMPLEADO cuando se le asigna un documento o una capacitación, y a HSE cuando un empleado rechaza un documento.
 * `renderActionEmail` escapa título y cuerpo: van en texto plano.
 */

const greeting = (name: string | null) => (name ? `Hola ${name}` : 'Hola');

/** Al empleado: se publicó un documento (o una versión nueva) que tiene que leer y aceptar. */
export function renderHseDocumentPublishedEmail(params: {
  name: string | null;
  companyName: string;
  title: string;
  version: number;
  isNewVersion: boolean;
  expiresAt: string | null;
}): RenderedEmail {
  const url = `${appUrl()}/portal/documents`;
  const what = params.isNewVersion
    ? `se publicó una versión nueva (v${params.version}) del documento HSE «${params.title}»`
    : `se publicó el documento HSE «${params.title}»`;
  const deadline = params.expiresAt ? ` Vence el ${formatDateAr(params.expiresAt)}.` : '';
  const body = `${greeting(params.name)}: ${what} y te toca leerlo y aceptarlo desde el portal.${deadline}`;
  return {
    subject: `Documento HSE para aceptar — ${params.companyName}`,
    text: `${body} Portal: ${url}`,
    html: renderActionEmail('Documento HSE para aceptar', body, { url, label: 'Ir a mis documentos' }),
  };
}

/** Al empleado: se le asignó una capacitación (material y examen) en el portal. */
export function renderHseTrainingPublishedEmail(params: {
  name: string | null;
  companyName: string;
  title: string;
  timeLimitMinutes: number | null;
  trainingId: string;
}): RenderedEmail {
  const url = `${appUrl()}/portal/trainings/${params.trainingId}`;
  const limit = params.timeLimitMinutes ? ` El examen tiene ${params.timeLimitMinutes} minutos para responder.` : '';
  const body = `${greeting(params.name)}: se te asignó la capacitación «${params.title}». Leé el material y rendí el examen desde el portal.${limit}`;
  return {
    subject: `Capacitación asignada — ${params.companyName}`,
    text: `${body} Portal: ${url}`,
    html: renderActionEmail('Capacitación asignada', body, { url, label: 'Ir a la capacitación' }),
  };
}

/** A HSE (por rol): un empleado rechazó un documento. */
export function renderHseDocumentRejectedEmail(params: {
  employee: string;
  file: string | null;
  title: string;
  reason: string;
  documentId: string;
}): RenderedEmail {
  const url = `${appUrl()}/dashboard/hse/documents/${params.documentId}`;
  const who = params.file ? `[${params.file}] ${params.employee}` : params.employee;
  const body = `${who} rechazó el documento HSE «${params.title}». Motivo: ${params.reason}`;
  return {
    subject: `Documento HSE rechazado: ${params.title}`,
    text: `${body} Detalle: ${url}`,
    html: renderActionEmail('Documento HSE rechazado', body, { url, label: 'Ver el documento' }),
  };
}
