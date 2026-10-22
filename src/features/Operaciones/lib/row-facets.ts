import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import type { FacetConfig } from '@/shared/lib/table-facets';

type RowWhere = Prisma.dailyreportrowsWhereInput;

/**
 * Facetas de las columnas de `dailyreportrows` que comparten el tablero de certificación y el detalle
 * del parte diario (estado, tipo de servicio, jornada, cliente, servicio, ítem y sector). Cada tabla las
 * mezcla con las suyas en su `FACET_CONFIG` (el área, por ejemplo, muestra un texto distinto en cada una).
 */
export const SHARED_ROW_FACETS = {
  status: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['status'], where, _count: true })).map((r) => ({
        key: r.status,
        count: r._count,
      })),
  },
  type_service: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['type_service'], where, _count: true })).map((r) => ({
        key: r.type_service,
        count: r._count,
      })),
  },
  working_day: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['working_day'], where, _count: true })).map((r) => ({
        key: r.working_day,
        count: r._count,
      })),
  },
  customer: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['customer_id'], where, _count: true })).map((r) => ({
        key: r.customer_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.customers.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((c) => [c.id, { value: c.id, label: c.name }]));
    },
  },
  service: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['service_id'], where, _count: true })).map((r) => ({
        key: r.service_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.customer_services.findMany({
        where: { id: { in: ids } },
        select: { id: true, service_name: true },
      });
      return new Map(rows.map((s) => [s.id, { value: s.id, label: s.service_name ?? s.id }]));
    },
  },
  item: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['item_id'], where, _count: true })).map((r) => ({
        key: r.item_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.service_items.findMany({
        where: { id: { in: ids } },
        select: { id: true, item_name: true },
      });
      return new Map(rows.map((i) => [i.id, { value: i.id, label: i.item_name ?? i.id }]));
    },
  },
  // sector_service_id → service_sectors → sectors (la opción es el sector real)
  sector: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['sector_service_id'], where, _count: true })).map((r) => ({
        key: r.sector_service_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.service_sectors.findMany({
        where: { id: { in: ids } },
        select: { id: true, sectors: { select: { id: true, name: true } } },
      });
      return new Map(
        rows.flatMap((ss) => (ss.sectors ? [[ss.id, { value: ss.sectors.id, label: ss.sectors.name }] as const] : []))
      );
    },
  },
} satisfies Record<string, FacetConfig<RowWhere>>;
