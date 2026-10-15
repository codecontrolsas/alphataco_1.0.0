import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type CatalogClient = Pick<
  Prisma.TransactionClient,
  | 'hierarchy'
  | 'company_positions'
  | 'work_diagram'
  | 'types_of_contract'
  | 'cost_center'
  | 'covenant'
  | 'guild'
  | 'category'
  | 'customers'
  | 'aptitudes_tecnicas'
  | 'workshop_sectors'
>;

interface WorkCatalogIds {
  hierarchical_position?: string | null;
  company_position?: string | null;
  workflow_diagram?: string | null;
  type_of_contract?: string | null;
  cost_center_id?: string | null;
  covenants_id?: string | null;
  guild_id?: string | null;
  category_id?: string | null;
  allocated_to?: string[] | null;
  aptitudes?: string[] | null;
  workshop_sector_ids?: string[] | null;
}

function unique(ids: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  return [...new Set((ids ?? []).filter((id): id is string => Boolean(id)))];
}

/**
 * Perímetro sin RLS: los ids de catálogos que llegan del cliente deben ser de la empresa activa
 * (el gremio admite además el catálogo global, `company_id` NULL). Lanza si alguno es ajeno o no existe.
 */
export async function assertWorkCatalogsOwned(client: CatalogClient, companyId: string, ids: WorkCatalogIds) {
  const checks: Array<{ label: string; ids: string[]; count: (ids: string[]) => Promise<number> }> = [
    {
      label: 'Sector',
      ids: unique([ids.hierarchical_position]),
      count: (list) => client.hierarchy.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Puesto',
      ids: unique([ids.company_position]),
      count: (list) => client.company_positions.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Diagrama',
      ids: unique([ids.workflow_diagram]),
      count: (list) => client.work_diagram.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Tipo de contrato',
      ids: unique([ids.type_of_contract]),
      count: (list) => client.types_of_contract.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Centro de costos',
      ids: unique([ids.cost_center_id]),
      count: (list) => client.cost_center.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Convenio',
      ids: unique([ids.covenants_id]),
      count: (list) => client.covenant.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Gremio',
      ids: unique([ids.guild_id]),
      count: (list) =>
        client.guild.count({ where: { id: { in: list }, OR: [{ company_id: companyId }, { company_id: null }] } }),
    },
    {
      label: 'Categoría',
      ids: unique([ids.category_id]),
      // La categoría no tiene empresa propia: cuelga de un convenio
      count: (list) => client.category.count({ where: { id: { in: list }, covenant: { company_id: companyId } } }),
    },
    {
      label: 'Cliente',
      ids: unique(ids.allocated_to),
      count: (list) => client.customers.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Aptitud',
      ids: unique(ids.aptitudes),
      count: (list) => client.aptitudes_tecnicas.count({ where: { id: { in: list }, company_id: companyId } }),
    },
    {
      label: 'Sector de taller',
      ids: unique(ids.workshop_sector_ids),
      count: (list) => client.workshop_sectors.count({ where: { id: { in: list }, company_id: companyId } }),
    },
  ];

  for (const check of checks) {
    if (check.ids.length === 0) continue;
    const owned = await check.count(check.ids);
    if (owned !== check.ids.length) {
      throw new Error(`${check.label} inválido para la empresa activa`);
    }
  }
}
