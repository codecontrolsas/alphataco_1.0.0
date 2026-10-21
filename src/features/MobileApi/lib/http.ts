import { NextResponse } from 'next/server';
import { MOBILE_API_VERSION } from './config';
import type { RowErrorCode } from '@/features/Operaciones/PartesDiarios/detail/use-cases/errors';
import type { UseCaseResult } from '@/features/Operaciones/PartesDiarios/detail/use-cases/types';

/** Códigos de error propios de la API (los de los casos de uso viajan tal cual). */
export type MobileApiErrorCode =
  | 'MOBILE_API_DISABLED'
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

export function mobileError(status: number, code: MobileApiErrorCode, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return mobileJson({ error: { code, message, ...extra } }, { status });
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
    return mobileJson({ data: result.data, replayed: result.replayed }, { headers: { 'X-Command-Replayed': String(result.replayed) } });
  }
  return mobileError(statusForRowError(result.code), result.code, result.message, result.currentVersion !== undefined ? { currentVersion: result.currentVersion } : {});
}
