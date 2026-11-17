'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel, vehicleLabel } from '@/shared/lib/resource-labels';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { AUDIT_EVENTS } from '../lib/audit-events';
import { getVisibleFitKinds } from '../lib/customer-compliance.server';

const logger = new Logger('features/Documentacion/CumplimientoClientes/audit');

const PAGE_SIZE = 50;

const auditSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  event: z.enum(AUDIT_EVENTS).optional(),
  kind: z.enum(['Persona', 'Equipos']).optional(),
  page: z.number().int().min(0).max(10_000).default(0),
});

export type AuditFilters = z.input<typeof auditSchema>;

/** Inicio del día `YYYY-MM-DD` en hora argentina (UTC-3, sin horario de verano). */
const arStart = (day: string) => new Date(`${day}T00:00:00-03:00`);

/**
 * Auditoría de documentos: cada carga, reemplazo, aprobación, rechazo o baja (y las cargas con IA o por link externo)
 * con autor y fecha, filtrable por período, tipo de evento y tipo de recurso. Solo de los recursos cuyos documentos el
 * usuario puede ver. Página de 50, de lo más nuevo a lo más viejo.
 */
export async function getDocumentAuditEvents(filters: AuditFilters) {
  const parsed = auditSchema.safeParse(filters);
  if (!parsed.success) return { ok: false as const, error: 'Los filtros no son válidos' };
  const kinds = await getVisibleFitKinds();
  if (kinds.length === 0) return { ok: false as const, error: 'No tenés permiso para ver la documentación' };
  const { from, to, event, kind, page } = parsed.data;
  if (kind && !kinds.includes(kind))
    return { ok: false as const, error: 'No tenés permiso para ver esa documentación' };

  try {
    const companyId = await getActiveCompanyId();
    const where = {
      company_id: companyId,
      resource_kind: kind ? kind : { in: kinds },
      ...(event ? { event } : {}),
      ...(from || to
        ? {
            created_at: {
              ...(from ? { gte: arStart(from) } : {}),
              ...(to ? { lt: new Date(arStart(to).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.document_audit_events.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          resource_kind: true,
          document_id: true,
          resource_id: true,
          document_type_id: true,
          event: true,
          actor_id: true,
          actor_kind: true,
          detail: true,
          created_at: true,
        },
      }),
      prisma.document_audit_events.count({ where }),
    ]);

    // Nombres de lo que aparece en la página: una consulta por catálogo, acotada a los ids de la página.
    const ids = (pick: (r: (typeof rows)[number]) => string | null) => [
      ...new Set(rows.map(pick).filter((v): v is string => Boolean(v))),
    ];
    const employeeIds = ids((r) => (r.resource_kind === 'Persona' ? r.resource_id : null));
    const vehicleIds = ids((r) => (r.resource_kind === 'Equipos' ? r.resource_id : null));
    const [types, employees, vehicles, actors] = await Promise.all([
      prisma.document_types.findMany({
        where: { id: { in: ids((r) => r.document_type_id) }, company_id: companyId },
        select: { id: true, name: true },
      }),
      employeeIds.length
        ? prisma.employees.findMany({
            where: { id: { in: employeeIds }, company_id: companyId },
            select: { id: true, file: true, lastname: true, firstname: true },
          })
        : Promise.resolve([]),
      vehicleIds.length
        ? prisma.vehicles.findMany({
            where: { id: { in: vehicleIds }, company_id: companyId },
            select: { id: true, intern_number: true, domain: true, serie: true },
          })
        : Promise.resolve([]),
      prisma.profile.findMany({
        where: { credential_id: { in: ids((r) => r.actor_id) } },
        select: { credential_id: true, fullname: true, email: true },
      }),
    ]);
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const resourceName = new Map<string, string>([
      ...employees.map((e): [string, string] => [e.id, employeeLabel(e)]),
      ...vehicles.map((v): [string, string] => [v.id, vehicleLabel(v) || v.serie || 'Equipo']),
    ]);
    const actorName = new Map(actors.map((a) => [a.credential_id, a.fullname || a.email || 'Usuario']));

    return {
      ok: true as const,
      total,
      pageSize: PAGE_SIZE,
      events: rows.map((r) => ({
        id: r.id,
        kind: r.resource_kind as 'Persona' | 'Equipos',
        documentId: r.document_id,
        resourceId: r.resource_id,
        resource: r.resource_id ? resourceName.get(r.resource_id) ?? 'Recurso dado de baja o eliminado' : '—',
        documentType: r.document_type_id ? typeName.get(r.document_type_id) ?? 'Tipo eliminado' : '—',
        event: r.event,
        actor: r.actor_id ? actorName.get(r.actor_id) ?? 'Usuario eliminado' : null,
        actorKind: r.actor_kind,
        detail: r.detail,
        createdAt: r.created_at.toISOString(),
      })),
    };
  } catch (error) {
    logger.error('Error al leer la auditoría de documentos', { data: { error } });
    throw new Error('No se pudo leer la auditoría');
  }
}

export type DocumentAuditPage = Extract<Awaited<ReturnType<typeof getDocumentAuditEvents>>, { ok: true }>;
