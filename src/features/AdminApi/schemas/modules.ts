import { MODULE_KEYS } from '@/features/Modules/catalog';
import { z } from 'zod';

/**
 * Contratos de `/api/admin/v1/modules` (control de módulos, F3). Los pedidos se validan al entrar y las respuestas al
 * salir: lo que no está en el schema no viaja (sin tokens, sin datos de negocio).
 */

const moduleKey = z.enum(MODULE_KEYS);
const scope = z.enum(['instance', 'company']);
const cause = z.enum(['requested', 'cascade', 'dependency']);

export const planRequestSchema = z
  .object({
    scope,
    companyId: z.string().uuid().nullable().optional().default(null),
    changes: z
      .array(z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }))
      .min(1)
      .max(MODULE_KEYS.length)
      .refine((changes) => new Set(changes.map((c) => c.key)).size === changes.length, 'Claves repetidas'),
    cascade: z.boolean().optional().default(false),
    withDependencies: z.boolean().optional().default(false),
  })
  .strict()
  .refine((value) => (value.scope === 'company') === Boolean(value.companyId), {
    message: 'companyId es obligatorio en el ámbito empresa y no va en el de instancia',
    path: ['companyId'],
  });

export const applyRequestSchema = z
  .object({
    scope,
    companyId: z.string().uuid().nullable().optional().default(null),
    changes: z
      .array(z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }))
      .min(1)
      .max(MODULE_KEYS.length)
      .refine((changes) => new Set(changes.map((c) => c.key)).size === changes.length, 'Claves repetidas'),
    cascade: z.boolean().optional().default(false),
    withDependencies: z.boolean().optional().default(false),
    expectedStateVersion: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine((value) => (value.scope === 'company') === Boolean(value.companyId), {
    message: 'companyId es obligatorio en el ámbito empresa y no va en el de instancia',
    path: ['companyId'],
  });

export type PlanRequestInput = z.infer<typeof planRequestSchema>;
export type ApplyRequestInput = z.infer<typeof applyRequestSchema>;

const effectSchema = z.object({
  scope,
  companyId: z.string().nullable(),
  key: moduleKey,
  from: z.boolean().nullable(),
  to: z.boolean(),
  cause,
});

const blockSchema = z.object({
  key: z.string(),
  code: z.enum([
    'HAS_DEPENDENTS',
    'MISSING_DEPENDENCIES',
    'INSTANCE_DISABLED',
    'CORE',
    'UNKNOWN_KEY',
    'COMPANY_NOT_FOUND',
  ]),
  companyId: z.string().optional(),
  dependents: z.array(moduleKey).optional(),
  missing: z.array(moduleKey).optional(),
});

export const planResponseSchema = z.object({
  stateVersion: z.string(),
  applicable: z.boolean(),
  effective: z.array(effectSchema),
  blocked: z.array(blockSchema),
  cascadePreview: z.array(effectSchema),
  softImpacts: z.array(z.object({ key: moduleKey, because: moduleKey, message: z.string() })),
  affectedCompanies: z.number().int(),
  reconcile: z.array(z.string()),
});

export const applyResponseSchema = z.object({
  stateVersion: z.string(),
  requestId: z.string().uuid(),
  replayed: z.boolean(),
  applied: z.array(effectSchema),
  reconcile: z.array(z.string()),
});

export const modulesListResponseSchema = z.object({
  catalogSha: z.string().nullable(),
  stateVersion: z.string(),
  core: z.array(moduleKey),
  modules: z.array(
    z.object({
      key: moduleKey,
      name: z.string(),
      description: z.string(),
      requires: z.array(moduleKey),
      requiresAny: z.array(z.array(moduleKey)),
      requiredBy: z.array(moduleKey),
      softDeps: z.array(moduleKey),
      instance: z.object({ enabled: z.boolean(), changedAt: z.string(), changedBy: z.string() }).nullable(),
      disabledInCompanies: z.array(z.string()),
    })
  ),
  companies: z.array(
    z.object({ id: z.string(), name: z.string(), isActive: z.boolean(), disabled: z.array(moduleKey) })
  ),
  catalogSync: z
    .object({ at: z.string(), tabsOwned: z.number(), tabsMissingOwner: z.number(), rows: z.number() })
    .nullable(),
});

export const changeLogResponseSchema = z.object({
  requests: z.array(
    z.object({
      requestId: z.string(),
      createdAt: z.string(),
      actorEmail: z.string(),
      origin: z.string(),
      reason: z.string(),
      changes: z.array(
        z.object({
          scope,
          companyId: z.string().nullable(),
          key: z.string(),
          from: z.boolean().nullable(),
          to: z.boolean(),
          cause,
        })
      ),
    })
  ),
  nextBefore: z.string().nullable(),
});

export const changeLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});
