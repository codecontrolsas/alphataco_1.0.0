import type { RowErrorCode } from '@/features/Operaciones/PartesDiarios/detail/use-cases/errors';
import type { UseCaseResult } from '@/features/Operaciones/PartesDiarios/detail/use-cases/types';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { MOBILE_API_VERSION } from './config';

/** Códigos de error propios de la API (los de los casos de uso viajan tal cual). */
export type MobileApiErrorCode =
  | 'MOBILE_API_DISABLED'
  | 'MODULE_DISABLED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NO_ACTIVE_COMPANY'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR'
  | RowErrorCode;

const headers = { 'X-Mobile-Api-Version': MOBILE_API_VERSION, 'Cache-Control': 'no-store' };

export function mobileJson<T>(body: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...headers, ...init.headers } });
}

export function mobileError(
  status: number,
  code: MobileApiErrorCode,
  message: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return mobileJson({ error: { code, message, ...extra } }, { status });
}

/**
 * Respuesta de lectura con validación de salida, ETag y revalidación: `private, no-cache` deja guardarla en el
 * dispositivo pero obliga a preguntar antes de usarla; si el `If-None-Match` coincide responde 304 sin cuerpo.
 * El schema valida lo que sale: un cambio de forma rompe en el servidor, no en el teléfono.
 */
export function mobileReadJson<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: T): Response {
  const parsed = schema.parse(body);
  const json = JSON.stringify(parsed);
  const etag = `"${createHash('sha1').update(json).digest('base64url')}"`;
  const cacheHeaders = { ...headers, 'Cache-Control': 'private, no-cache', ETag: etag };
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }
  return new Response(json, { status: 200, headers: { ...cacheHeaders, 'Content-Type': 'application/json' } });
}

/** Estado HTTP de cada código de error de los casos de uso. El `switch` es exhaustivo: un código nuevo no compila sin mapa. */
export function statusForRowError(code: RowErrorCode): number {
  switch (code) {
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'INVALID_INPUT':
    case 'RESOURCE_INACTIVE':
      return 422;
    case 'ROW_IN_CERTIFICATION':
    case 'ROW_EXECUTED_PAST':
    case 'REPORT_CLOSED':
    case 'VERSION_CONFLICT':
    case 'COMMAND_ID_REUSED':
      return 409;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

/** Traduce el resultado de un caso de uso: éxito 200 con `replayed`, error con su código estable. */
export function useCaseToResponse<T>(result: UseCaseResult<T>): NextResponse {
  if (result.ok) {
    return mobileJson(
      { data: result.data, replayed: result.replayed },
      { headers: { 'X-Command-Replayed': String(result.replayed) } }
    );
  }
  return mobileError(
    statusForRowError(result.code),
    result.code,
    result.message,
    result.currentVersion !== undefined ? { currentVersion: result.currentVersion } : {}
  );
}
