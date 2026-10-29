import {
  BANNER_MESSAGE_MAX,
  BANNER_SEVERITIES,
  PAUSE_MESSAGE_MAX,
  sanitizePlainText,
} from '@/shared/lib/instance-controls-core';
import { z } from 'zod';

/**
 * Contratos de `/api/admin/v1/instance` (controles de instancia: límite de empresas, pausa y banners). Los pedidos se
 * validan al entrar y las respuestas al salir, como en `/modules`. Los textos son planos: se limpian de caracteres de
 * control y se recortan.
 */

/** Tope del límite de empresas que acepta la API (cota de cordura, no de negocio). */
export const MAX_COMPANIES_CEILING = 1000;

const severity = z.enum(BANNER_SEVERITIES);

const plainText = (max: number) =>
  z
    .string()
    .max(max * 2, `Máximo ${max} caracteres`)
    .transform((value) => sanitizePlainText(value, Number.MAX_SAFE_INTEGER))
    .refine((value) => value.length <= max, `Máximo ${max} caracteres`);

const bannerPatch = z
  .object({
    enabled: z.boolean().optional(),
    message: plainText(BANNER_MESSAGE_MAX).optional(),
    severity: severity.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'El banner no trae cambios');

export const instanceUpdateRequestSchema = z
  .object({
    expectedVersion: z.string().regex(/^[0-9a-f]{64}$/, 'expectedVersion inválida'),
    reason: z.string().trim().min(3, 'reason es obligatorio (mínimo 3 caracteres)').max(500),
    max_companies: z.number().int().min(1).max(MAX_COMPANIES_CEILING).optional(),
    pause: z
      .object({ active: z.boolean().optional(), message: plainText(PAUSE_MESSAGE_MAX).optional() })
      .strict()
      .refine((value) => Object.keys(value).length > 0, 'La pausa no trae cambios')
      .optional(),
    banners: z
      .object({ login: bannerPatch.optional(), dashboard: bannerPatch.optional() })
      .strict()
      .refine((value) => Object.keys(value).length > 0, 'banners no trae cambios')
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.max_companies !== undefined || value.pause !== undefined || value.banners !== undefined,
    'El pedido no trae cambios (max_companies, pause o banners)'
  );

export type InstanceUpdateRequest = z.infer<typeof instanceUpdateRequestSchema>;

const bannerSchema = z.object({ enabled: z.boolean(), message: z.string(), severity });

export const instanceStateResponseSchema = z.object({
  version: z.string(),
  limits: z.object({
    max_companies: z.number().int(),
    companies_total: z.number().int(),
    companies_limit_reached: z.boolean(),
  }),
  pause: z.object({ active: z.boolean(), message: z.string(), since: z.string().nullable() }),
  banners: z.object({ login: bannerSchema, dashboard: bannerSchema }),
});

/** Campos que registra la auditoría (`instance_change_log.field`). */
export const INSTANCE_FIELDS = [
  'max_companies',
  'pause.active',
  'pause.message',
  'banners.login.enabled',
  'banners.login.message',
  'banners.login.severity',
  'banners.dashboard.enabled',
  'banners.dashboard.message',
  'banners.dashboard.severity',
] as const;
export type InstanceField = (typeof INSTANCE_FIELDS)[number];

const changeSchema = z.object({
  field: z.enum(INSTANCE_FIELDS),
  from: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  to: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const instanceUpdateResponseSchema = z.object({
  version: z.string(),
  requestId: z.string().uuid(),
  replayed: z.boolean(),
  changes: z.array(changeSchema),
  state: instanceStateResponseSchema,
});

export const instanceLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

export const instanceLogResponseSchema = z.object({
  requests: z.array(
    z.object({
      requestId: z.string().uuid(),
      createdAt: z.string(),
      actorEmail: z.string(),
      origin: z.string(),
      reason: z.string(),
      changes: z.array(changeSchema),
    })
  ),
  nextBefore: z.string().nullable(),
});
