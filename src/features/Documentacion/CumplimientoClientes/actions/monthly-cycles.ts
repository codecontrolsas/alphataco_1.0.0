'use server';

import { validateDocumentFile } from '@/features/Documentacion/shared/lib/document-file-rules';
import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { storageFileUrls, storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { CYCLE_KINDS, checkMonthlyCycle, type CycleKind } from '../lib/monthly-cycle-check';

const logger = new Logger('features/Documentacion/CumplimientoClientes/monthly-cycles');

const BUCKET = 'compliance-files';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Los ciclos son documentación mensual de la empresa: mismos permisos que esa lista. */
async function cyclePermissions() {
  const granted = await checkMultiplePermissionsServer([
    { moduleSlug: 'documentacion', tabSlug: 'docs-empresa-mensuales', actionSlug: 'view' },
    { moduleSlug: 'documentacion', tabSlug: 'docs-empresa-mensuales', actionSlug: 'update' },
  ]);
  return {
    canView: granted.get('documentacion:docs-empresa-mensuales:view') === true,
    canEdit: granted.get('documentacion:docs-empresa-mensuales:update') === true,
  };
}

const toNumber = (value: { toNumber(): number } | null) => (value === null ? null : value.toNumber());

/** Personal activo durante el período: ingresó antes de fin de mes y no se dio de baja antes de que empiece. */
async function payrollHeadcount(companyId: string, period: string): Promise<number> {
  const [rows] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM employees
    WHERE company_id = ${companyId}::uuid
      AND (date_of_admission IS NULL OR date_of_admission < (to_date(${period}, 'YYYY-MM') + interval '1 month'))
      AND (termination_date IS NULL OR termination_date >= to_date(${period}, 'YYYY-MM'))
      AND (is_active IS NOT FALSE OR termination_date IS NOT NULL)`;
  return Number(rows?.count ?? 0);
}

/** Ciclos de un período con su validación, los rechazos y los clientes para rechazar. */
export async function getMonthlyCycles(period: string) {
  if (!PERIOD_RE.test(period)) return { ok: false as const, error: 'Período inválido' };
  const { canView, canEdit } = await cyclePermissions();
  if (!canView) return { ok: false as const, error: 'No tenés permiso para ver los ciclos mensuales' };
  try {
    const companyId = await getActiveCompanyId();
    const [cycles, headcount, customers] = await Promise.all([
      prisma.monthly_cycles.findMany({
        where: { company_id: companyId, period },
        orderBy: [{ kind: 'asc' }, { label: 'asc' }],
        include: {
          rejections: {
            orderBy: { rejected_at: 'desc' },
            select: {
              id: true,
              reason: true,
              rejected_at: true,
              resolved_at: true,
              resolution_note: true,
              customer_id: true,
            },
          },
        },
      }),
      payrollHeadcount(companyId, period),
      prisma.customers.findMany({
        where: { company_id: companyId, is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const allCustomers = await prisma.customers.findMany({
      where: {
        company_id: companyId,
        id: { in: [...new Set(cycles.flatMap((c) => c.rejections.map((r) => r.customer_id)))] },
      },
      select: { id: true, name: true },
    });
    const customerName = new Map(allCustomers.map((c) => [c.id, c.name]));
    const paths = cycles
      .flatMap((c) => [c.declaration_path, c.slip_path, c.payment_path])
      .filter((p): p is string => !!p);
    const urls = paths.length ? await storageFileUrls(BUCKET, paths) : { ok: true as const, data: [] };
    const urlByPath = new Map(urls.ok ? urls.data.map((u) => [u.path, u.url]) : []);

    return {
      ok: true as const,
      canEdit,
      payrollHeadcount: headcount,
      customers,
      cycles: cycles.map((c) => {
        const values = {
          declaredHeadcount: c.declared_headcount,
          declaredAmount: toNumber(c.declared_amount),
          slipAmount: toNumber(c.slip_amount),
          paidAmount: toNumber(c.paid_amount),
        };
        const openRejections = c.rejections.filter((r) => !r.resolved_at).length;
        return {
          id: c.id,
          kind: c.kind as CycleKind,
          label: c.label,
          period: c.period,
          notes: c.notes,
          ...values,
          files: {
            declaration: c.declaration_path ? urlByPath.get(c.declaration_path) ?? null : null,
            slip: c.slip_path ? urlByPath.get(c.slip_path) ?? null : null,
            payment: c.payment_path ? urlByPath.get(c.payment_path) ?? null : null,
          },
          check: checkMonthlyCycle({
            kind: c.kind as CycleKind,
            ...values,
            hasDeclaration: Boolean(c.declaration_path),
            hasSlip: Boolean(c.slip_path),
            hasPayment: Boolean(c.payment_path),
            payrollHeadcount: headcount,
            openRejections,
          }),
          rejections: c.rejections.map((r) => ({
            id: r.id,
            customer: customerName.get(r.customer_id) ?? 'Cliente dado de baja',
            reason: r.reason,
            rejectedAt: r.rejected_at.toISOString(),
            resolvedAt: r.resolved_at?.toISOString() ?? null,
            resolutionNote: r.resolution_note,
          })),
        };
      }),
    };
  } catch (error) {
    logger.error('Error al leer los ciclos mensuales', { data: { error, period } });
    throw new Error('No se pudieron leer los ciclos mensuales');
  }
}

export type MonthlyCyclesData = Extract<Awaited<ReturnType<typeof getMonthlyCycles>>, { ok: true }>;

const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))),
  z.number().nonnegative().nullable()
);

const cycleSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(CYCLE_KINDS),
  label: z.string().trim().max(120).default(''),
  period: z.string().regex(PERIOD_RE),
  declaredHeadcount: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().nonnegative().nullable()
  ),
  declaredAmount: optionalNumber,
  slipAmount: optionalNumber,
  paidAmount: optionalNumber,
  notes: z.string().trim().max(1000).optional(),
});

const FILE_FIELDS = { declaration: 'declaration_path', slip: 'slip_path', payment: 'payment_path' } as const;

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80);

/**
 * Crea o actualiza un ciclo mensual con sus montos y archivos (declaración, boleta, pago). Un archivo que no viene no
 * se toca. Si la base falla, se borran los archivos recién subidos.
 */
export async function saveMonthlyCycle(formData: FormData) {
  const { canEdit } = await cyclePermissions();
  if (!canEdit) return { ok: false as const, error: 'No tenés permiso para cargar ciclos mensuales' };
  const parsed = cycleSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string'))
  );
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const data = parsed.data;
  if ((data.kind === 'sindical' || data.kind === 'plan_pago') && !data.label) {
    return { ok: false as const, error: data.kind === 'sindical' ? 'Indicá el sindicato' : 'Indicá el número de plan' };
  }

  const files = Object.keys(FILE_FIELDS).flatMap((key) => {
    const file = formData.get(key);
    return file instanceof File && file.size > 0 ? [{ key: key as keyof typeof FILE_FIELDS, file }] : [];
  });
  for (const { file } of files) {
    const error = validateDocumentFile(file);
    if (error) return { ok: false as const, error };
  }

  const companyId = await getActiveCompanyId();
  const userId = await getSessionUserId();
  const existing = data.id
    ? await prisma.monthly_cycles.findFirst({
        where: { id: data.id, company_id: companyId },
        select: { id: true, declaration_path: true, slip_path: true, payment_path: true },
      })
    : null;
  if (data.id && !existing) return { ok: false as const, error: 'El ciclo no existe' };

  const uploaded: string[] = [];
  const paths: Partial<Record<(typeof FILE_FIELDS)[keyof typeof FILE_FIELDS], string>> = {};
  for (const { key, file } of files) {
    const path = `${companyId}/cycles/${data.period}/${data.kind}-${Date.now()}-${safeName(file.name)}`;
    const result = await storageUpload(BUCKET, path, file);
    if (!result.ok) {
      if (uploaded.length) await storageRemove(BUCKET, uploaded);
      return { ok: false as const, error: 'No se pudo subir el archivo. Intentá de nuevo.' };
    }
    uploaded.push(path);
    paths[FILE_FIELDS[key]] = path;
  }

  const values = {
    kind: data.kind,
    label: data.label,
    period: data.period,
    declared_headcount: data.declaredHeadcount,
    declared_amount: data.declaredAmount,
    slip_amount: data.slipAmount,
    paid_amount: data.paidAmount,
    notes: data.notes || null,
    updated_at: new Date(),
    ...paths,
  };
  try {
    if (existing) {
      await prisma.monthly_cycles.updateMany({ where: { id: existing.id, company_id: companyId }, data: values });
      // Los archivos reemplazados ya no los usa nadie.
      const replaced = (Object.keys(paths) as (keyof typeof paths)[])
        .map((field) => existing[field])
        .filter((p): p is string => !!p);
      if (replaced.length) await storageRemove(BUCKET, replaced);
    } else {
      await prisma.monthly_cycles.create({ data: { ...values, created_by: userId } });
    }
    return { ok: true as const };
  } catch (error) {
    if (uploaded.length) await storageRemove(BUCKET, uploaded);
    const duplicate = error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002';
    if (duplicate) return { ok: false as const, error: 'Ya hay un ciclo de ese tipo para ese período' };
    logger.error('Error al guardar el ciclo mensual', { data: { error } });
    return { ok: false as const, error: 'No se pudo guardar el ciclo' };
  }
}

const rejectSchema = z.object({
  cycleId: z.string().uuid(),
  customerId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Escribí el motivo del rechazo').max(500),
});

/** El cliente rechazó el ciclo: queda marcado «Rechazado por cliente» hasta que se resuelva. */
export async function rejectMonthlyCycle(input: z.input<typeof rejectSchema>) {
  const { canEdit } = await cyclePermissions();
  if (!canEdit) return { ok: false as const, error: 'No tenés permiso para cambiar ciclos mensuales' };
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const companyId = await getActiveCompanyId();
  const [cycle, customer] = await Promise.all([
    prisma.monthly_cycles.findFirst({
      where: { id: parsed.data.cycleId, company_id: companyId },
      select: { id: true },
    }),
    prisma.customers.findFirst({ where: { id: parsed.data.customerId, company_id: companyId }, select: { id: true } }),
  ]);
  if (!cycle || !customer) return { ok: false as const, error: 'El ciclo o el cliente no existen' };
  await prisma.monthly_cycle_rejections.create({
    data: {
      cycle_id: cycle.id,
      customer_id: customer.id,
      reason: parsed.data.reason,
      rejected_by: await getSessionUserId(),
    },
  });
  return { ok: true as const };
}

const resolveSchema = z.object({
  rejectionId: z.string().uuid(),
  note: z.string().trim().min(3, 'Contá qué se corrigió').max(500),
});

/** Se corrigió lo que el cliente rechazó. */
export async function resolveMonthlyCycleRejection(input: z.input<typeof resolveSchema>) {
  const { canEdit } = await cyclePermissions();
  if (!canEdit) return { ok: false as const, error: 'No tenés permiso para cambiar ciclos mensuales' };
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const companyId = await getActiveCompanyId();
  const result = await prisma.monthly_cycle_rejections.updateMany({
    where: { id: parsed.data.rejectionId, company_id: companyId, resolved_at: null },
    data: { resolved_at: new Date(), resolved_by: await getSessionUserId(), resolution_note: parsed.data.note },
  });
  return result.count === 1 ? { ok: true as const } : { ok: false as const, error: 'El rechazo ya estaba resuelto' };
}
