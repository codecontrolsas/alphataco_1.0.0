/**
 * Cumplimiento por cliente y ciclos mensuales (ticket 842).
 *
 * - Un tipo de documento que pide SOLO Andes Energía (condición «Clientes»): la matriz por cliente, el simulador y el
 *   aviso del parte diario lo muestran como faltante para quien trabaja para Andes y no lo cargó, y no lo piden para
 *   los demás clientes. Lo tiene cargado ~60 % del personal de Andes; algunos vencen pronto.
 * - Ciclos mensuales del mes anterior: un F.931 que cruza bien (validado) y un aporte sindical cuyo pago no coincide
 *   con la boleta, rechazado por Andes.
 * Ids deterministas: los links sobreviven al reset.
 */
import {
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_EVENTS,
} from '../../../src/features/Notifications/notification-catalog.ts';
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import { customerId, CUSTOMERS } from '../data/customers.ts';
import { addPdf, insertMany, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { companyFolder, DOCUMENT_BUCKET, pathSegment } from '../lib/paths.ts';
import type { DemoEmployee } from './employees.ts';

const COMPLIANCE_BUCKET = 'compliance-files';
const INDUCTION_KEY = 'induccion_andes';
const INDUCTION_NAME = 'Inducción de seguridad Andes Energía';

export async function seedCustomerCompliance(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, cal, faker, company } = ctx;
  const andes = CUSTOMERS.find((c) => c.key === 'andes');
  if (!andes) return;
  const andesId = customerId(andes);
  const typeId = demoId('doc_type', INDUCTION_KEY);

  await tx.document_types.create({
    data: {
      id: typeId,
      name: INDUCTION_NAME,
      applies: 'Persona',
      multiresource: false,
      mandatory: true,
      explired: true,
      special: true,
      is_active: true,
      description: 'Inducción de seguridad que exige Andes Energía para ingresar a sus locaciones.',
      company_id: company.id,
      is_it_montlhy: false,
      private: false,
      down_document: false,
      conditions: [
        {
          filter_column: 'contractor_id',
          relation_type: 'many_to_many',
          relation_table: 'contractor_employee',
          property_key: 'contractor_employee',
          property_label: 'Clientes',
          ids: [andesId],
          values: [andes.name],
        },
      ],
    },
  });

  const rows: Prisma.documents_employeesCreateManyInput[] = [];
  const andesStaff = employees.filter((e) => e.active && e.customers.includes(andesId));
  for (const emp of andesStaff) {
    if (faker.number.float() > 0.6) continue; // ~40 % sin la inducción: faltante para Andes
    const expiresIn =
      faker.number.float() < 0.2 ? faker.number.int({ min: 3, max: 25 }) : faker.number.int({ min: 60, max: 330 });
    const path = `${companyFolder()}/empleados/${emp.cuil}/${pathSegment(INDUCTION_NAME)}-(${cal.ymd(expiresIn)}).pdf`;
    rows.push({
      id: demoId('doc_employee', `${emp.id}:${INDUCTION_KEY}`),
      applies: emp.id,
      id_document_types: typeId,
      state: 'aprobado',
      validity: cal.day(expiresIn),
      document_path: path,
      user_id: ctx.actorId,
      created_at: cal.at(expiresIn - 365, 10),
    });
    await addPdf(ctx, DOCUMENT_BUCKET, path, {
      title: INDUCTION_NAME,
      fields: [
        ['Empleado', `${emp.lastname}, ${emp.firstname}`],
        ['CUIL', emp.cuil],
        ['Vence', cal.ymd(expiresIn).split('-').reverse().join('/')],
      ],
      body: 'Constancia de asistencia a la inducción de seguridad para contratistas de Andes Energía Upstream S.A.',
      reference: `${emp.cuil}/${INDUCTION_KEY}`,
    });
  }
  await insertMany(rows, (data) => tx.documents_employees.createMany({ data }), 500);

  // ── Ciclos mensuales del mes anterior ───────────────────────────────────────
  const period = cal.period(1);
  const range = cal.monthRange(1);
  const headcount = employees.filter(
    (e) => e.admission <= range.to && (e.terminationOffset === null || e.terminationOffset >= range.from)
  ).length;
  const f931Amount = Math.round(headcount * 412_350.4 * 100) / 100;
  const unionSlip = Math.round(headcount * 18_200.15 * 100) / 100;
  const cycleFile = async (kind: string, piece: string, title: string, amount: number | null) => {
    const key = `${company.id}/cycles/${period}/${kind}-${piece}.pdf`;
    await addPdf(ctx, COMPLIANCE_BUCKET, key, {
      title,
      fields: [
        ['Período', period],
        ...(amount !== null
          ? ([['Importe', `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]] as [string, string][])
          : []),
      ],
      body: `${title} del período ${period}.`,
      reference: `${kind}/${period}/${piece}`,
    });
    return key;
  };

  await tx.monthly_cycles.create({
    data: {
      id: demoId('monthly_cycle', `f931:${period}`),
      company_id: company.id,
      kind: 'f931',
      label: '',
      period,
      declared_headcount: headcount,
      declared_amount: f931Amount,
      slip_amount: f931Amount,
      paid_amount: f931Amount,
      declaration_path: await cycleFile('f931', 'ddjj', 'Declaración jurada F.931', f931Amount),
      slip_path: await cycleFile('f931', 'vep', 'VEP F.931', f931Amount),
      payment_path: await cycleFile('f931', 'pago', 'Comprobante de pago F.931', f931Amount),
      created_by: ctx.actorId,
    },
  });
  const unionId = demoId('monthly_cycle', `sindical:${period}`);
  await tx.monthly_cycles.create({
    data: {
      id: unionId,
      company_id: company.id,
      kind: 'sindical',
      label: 'Petroleros Privados',
      period,
      declared_amount: unionSlip,
      slip_amount: unionSlip,
      paid_amount: Math.round((unionSlip - 36_400.3) * 100) / 100,
      declaration_path: await cycleFile('sindical', 'nomina', 'Nómina de aportes sindicales', unionSlip),
      slip_path: await cycleFile('sindical', 'boleta', 'Boleta de depósito sindical', unionSlip),
      payment_path: await cycleFile('sindical', 'pago', 'Comprobante de pago sindical', unionSlip - 36_400.3),
      created_by: ctx.actorId,
    },
  });
  await tx.monthly_cycle_rejections.create({
    data: {
      id: demoId('monthly_cycle_rejection', `sindical:${period}`),
      company_id: company.id,
      cycle_id: unionId,
      customer_id: andesId,
      reason: 'El comprobante de pago no cubre el total de la boleta del sindicato.',
      rejected_by: ctx.actorId,
      rejected_at: cal.at(-3, 11),
    },
  });

  ctx.log(`cumplimiento por cliente: ${rows.length} inducciones de Andes y 2 ciclos mensuales`);
}

/**
 * Avisos por defecto de los roles de acceso completo. El reset vacía `role_notifications` (no está en la lista de
 * tablas que conserva), así que sin esto la demo amanecía sin destinatarios para ningún aviso del sistema.
 */
export async function seedDefaultRoleNotifications(ctx: Ctx): Promise<void> {
  const roles = await ctx.tx.roles.findMany({
    where: { slug: { in: ['admin', 'administrador', 'full-access-provisional'] } },
    select: { id: true },
  });
  const rows = roles.flatMap((role) =>
    NOTIFICATION_EVENT_KEYS.flatMap((eventKey) =>
      NOTIFICATION_EVENTS[eventKey].defaultChannels.map((channel) => ({
        role_id: role.id,
        event_key: eventKey,
        channel,
      }))
    )
  );
  const created = await ctx.tx.role_notifications.createMany({ data: rows, skipDuplicates: true });
  ctx.log(`avisos por defecto de los roles: ${created.count}`);
}
