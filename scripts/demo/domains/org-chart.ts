/**
 * Organigrama: los cargos de `ORG_CHART` dentro de cada sector, con su línea de reporte y como
 * titular el primer legajo activo que tiene ese mismo sector y puesto en su ficha (la misma regla
 * que valida la pantalla). Un cargo sin legajo así queda vacante. Va después de Empleados.
 */
import { ORG_CHART } from '../data/catalog.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import type { DemoEmployee } from './employees.ts';

export async function seedOrgChart(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const used = new Set<string>();
  const sortInSector = new Map<string, number>();

  // Los superiores van antes que sus reportes en `ORG_CHART`, así la FK se cumple al insertar en orden.
  const data = ORG_CHART.map((cargo) => {
    const holder = employees.find(
      (e) => e.active && e.sector === cargo.sector && e.position === cargo.position && !used.has(e.id)
    );
    if (holder) used.add(holder.id);
    const sortOrder = sortInSector.get(cargo.sector) ?? 0;
    sortInSector.set(cargo.sector, sortOrder + 1);
    return {
      id: demoId('org_chart_position', cargo.key),
      company_id: ctx.company.id,
      sector_id: demoId('hierarchy', cargo.sector),
      position_id: demoId('position', cargo.position),
      reports_to_id: cargo.reportsTo ? demoId('org_chart_position', cargo.reportsTo) : null,
      employee_id: holder?.id ?? null,
      sort_order: sortOrder,
    };
  });

  await ctx.tx.org_chart_positions.createMany({ data });
  ctx.log(`organigrama: ${data.length} cargos (${used.size} con titular)`);
}
