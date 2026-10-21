import { describe, expect, it } from 'vitest';

/**
 * Integración contra el Postgres del compose (sólo con DATABASE_URL). Valida que los
 * `select` de Prisma de la ficha de vehículos sean válidos en runtime (Prisma valida la
 * forma del select recién al ejecutar), aunque la base esté vacía.
 */
describe.skipIf(!process.env.DATABASE_URL)('ficha de vehículo (integración)', () => {
  it('los selects de la ficha, checklists, OM y catálogos son válidos', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const companyId = '00000000-0000-0000-0000-000000000000';
    const vehicle = await prisma.vehicles.findFirst({
      where: { id: companyId, company_id: companyId },
      select: {
        id: true,
        type_of_vehicle: true,
        price: true,
        brand_vehicles: { select: { id: true, name: true } },
        types_of_vehicles: { select: { id: true, name: true } },
        type_vehicles_typeTotype: { select: { id: true, name: true, generates_qr: true } },
        sub_type: { select: { id: true, name: true, tire_template_id: true } },
        equipment_owners: { select: { id: true, name: true } },
        contractor_equipment: { select: { customers: { select: { id: true, name: true } } } },
      },
    });
    expect(vehicle).toBeNull();

    const answers = await prisma.checklist_answers.findMany({
      where: { equipment_id: companyId, company_id: companyId },
      select: {
        id: true,
        critical_items_failed: true,
        checklist_templates: { select: { id: true, name: true, description: true, code: true } },
        profile: { select: { id: true, fullname: true, email: true } },
        checklist_deviations: { select: { id: true, item_code: true } },
        checklist_answers: { select: { id: true, equipment_id: true, vehicles: { select: { id: true, domain: true } } } },
      },
    });
    expect(answers).toEqual([]);

    const orders = await prisma.maintenance_orders.findMany({
      where: { equipment_id: companyId, company_id: companyId },
      select: {
        id: true,
        maintenance_requests: { select: { id: true, source: true } },
        maintenance_order_items: {
          select: {
            id: true,
            types_of_repairs: { select: { id: true, name: true, autorizable: true } },
            workshop_sectors: { select: { id: true, name: true } },
            workshops: { select: { id: true, name: true, type: true } },
            maintenance_request_items: { select: { driver_comment: true } },
            work_orders: {
              select: {
                id: true,
                work_order_items: {
                  select: { id: true, work_order_item_repairs: { select: { id: true, types_of_repairs: { select: { id: true } } } } },
                },
              },
            },
          },
        },
      },
    });
    expect(orders).toEqual([]);

    const owners = await prisma.equipment_owners.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, equipment_owner_contract_types: { select: { contract_type: true } } },
    });
    expect(Array.isArray(owners)).toBe(true);
  });
});
