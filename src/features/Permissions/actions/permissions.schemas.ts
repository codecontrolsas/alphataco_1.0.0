import { z } from 'zod';

/**
 * Schemas Zod para las 4 funciones SQL de `prisma/sql/permissions.sql` invocadas via
 * `callFunction`/`callScalar` (`src/shared/lib/sql.ts`). Una fila por función.
 */

/** Fila de `get_user_permissions(p_user_id uuid, p_company_id uuid)`. */
export const userPermissionRowSchema = z.object({
  module_id: z.string(),
  module_slug: z.string(),
  module_name: z.string(),
  tab_id: z.string(),
  tab_slug: z.string(),
  tab_name: z.string(),
  action_id: z.string(),
  action_slug: z.string(),
  action_name: z.string(),
  source: z.string(),
  is_granted: z.boolean(),
  role_id: z
    .union([z.bigint(), z.null()])
    .transform((value) => (value === null ? null : Number(value))),
  role_name: z.string().nullable(),
  role_color: z.string().nullable(),
});
export type UserPermissionRow = z.infer<typeof userPermissionRowSchema>;

/** Fila de `check_multiple_permissions(p_user_id uuid, p_company_id uuid, p_permissions jsonb)`. */
export const checkMultiplePermissionsRowSchema = z.object({
  module_slug: z.string(),
  tab_slug: z.string(),
  action_slug: z.string(),
  has_permission: z.boolean(),
});

/** Fila de `get_user_accessible_modules(p_user_id uuid, p_company_id uuid)`. */
export const accessibleModuleRowSchema = z.object({
  module_id: z.string(),
  module_slug: z.string().nullable(),
  module_name: z.string(),
  module_icon: z.string().nullable(),
});
