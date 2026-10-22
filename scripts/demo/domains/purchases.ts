/**
 * Compras (etapa 1): rubros, proveedores con contactos, condicion de pago y documentos (alguno
 * vencido o por vencer), y solicitudes de compra en todos los estados, una generada desde un
 * pedido de materiales de Almacenes. Va DESPUES de Almacenes: usa sus materiales y pedidos.
 *
 * Etapa 2: una solicitud cotizada a 3 proveedores (respondio, sin respuesta, no cotiza), una OC
 * enviada desde la cotizacion mas barata (la solicitud queda pedida en parte), una OC directa
 * pendiente de aprobacion y una OC rechazada que volvio a borrador.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import { addPdf, type Ctx } from '../lib/ctx.ts';
import { toDmy } from '../lib/dates.ts';
import { demoId } from '../lib/ids.ts';
import { seedQuotesAndOrders } from './purchases-quotes-orders.ts';
import { seedReceipts } from './purchases-receipts.ts';
import { seedSupplierInvoices } from './supplier-invoices.ts';
import { seedSupplierPayments } from './supplier-payments.ts';

export const SUPPLIER_DOCUMENTS_BUCKET = 'supplier-documents';

const CATEGORIES = ['Repuestos', 'Cubiertas', 'Lubricantes', 'Servicios de taller', 'Ropa y EPP'] as const;

interface DemoSupplier {
  key: string;
  name: string;
  tradeName: string | null;
  /** 10 digitos: el verificador se calcula. */
  cuitPrefix: string;
  vat: number;
  city: string;
  paymentDays: number;
  categories: (typeof CATEGORIES)[number][];
  contact: { name: string; role: string };
  /** Dias hasta el vencimiento de la constancia (negativo = vencida). */
  arcaExpiry: number;
}

const SUPPLIERS: DemoSupplier[] = [
  {
    key: 'repuestos-sur',
    name: 'Repuestos del Sur SRL',
    tradeName: null,
    cuitPrefix: '3071234567',
    vat: 1,
    city: 'Neuquén',
    paymentDays: 30,
    categories: ['Repuestos'],
    contact: { name: 'Ana Pérez', role: 'Ventas' },
    arcaExpiry: 200,
  },
  {
    key: 'neumaticos-patagonia',
    name: 'Neumáticos Patagonia SA',
    tradeName: 'NeuPat',
    cuitPrefix: '3070112233',
    vat: 1,
    city: 'Cipolletti',
    paymentDays: 45,
    categories: ['Cubiertas'],
    contact: { name: 'Carlos Ruiz', role: 'Comercial' },
    arcaExpiry: 18,
  },
  {
    key: 'lubricantes-comahue',
    name: 'Lubricantes del Comahue SRL',
    tradeName: null,
    cuitPrefix: '3071555222',
    vat: 1,
    city: 'Plottier',
    paymentDays: 30,
    categories: ['Lubricantes'],
    contact: { name: 'María Gómez', role: 'Atención a empresas' },
    arcaExpiry: -12,
  },
  {
    key: 'taller-andes',
    name: 'Taller Mecánico Los Andes',
    tradeName: null,
    cuitPrefix: '2028765432',
    vat: 6,
    city: 'Neuquén',
    paymentDays: 15,
    categories: ['Servicios de taller'],
    contact: { name: 'Jorge Díaz', role: 'Titular' },
    arcaExpiry: 120,
  },
  {
    key: 'indumentaria-sur',
    name: 'Indumentaria del Sur SA',
    tradeName: null,
    cuitPrefix: '3070987654',
    vat: 1,
    city: 'Neuquén',
    paymentDays: 30,
    categories: ['Ropa y EPP'],
    contact: { name: 'Lucía Fernández', role: 'Ventas' },
    arcaExpiry: 300,
  },
  {
    key: 'hidraulica-vaca-muerta',
    name: 'Hidráulica Vaca Muerta SRL',
    tradeName: 'HVM',
    cuitPrefix: '3071888999',
    vat: 1,
    city: 'Añelo',
    paymentDays: 60,
    categories: ['Repuestos', 'Servicios de taller'],
    contact: { name: 'Pablo Sosa', role: 'Jefe de servicio' },
    arcaExpiry: 25,
  },
  {
    key: 'ferreteria-industrial',
    name: 'Ferretería Industrial Neuquén SA',
    tradeName: null,
    cuitPrefix: '3070333444',
    vat: 1,
    city: 'Neuquén',
    paymentDays: 30,
    categories: ['Repuestos', 'Ropa y EPP'],
    contact: { name: 'Sofía Herrera', role: 'Mostrador' },
    arcaExpiry: 90,
  },
  {
    key: 'filtros-norte',
    name: 'Filtros Norte',
    tradeName: null,
    cuitPrefix: '2033445566',
    vat: 6,
    city: 'Centenario',
    paymentDays: 0,
    categories: ['Repuestos', 'Lubricantes'],
    contact: { name: 'Diego Molina', role: 'Titular' },
    arcaExpiry: 150,
  },
  // Etapa 4: proveedores de gastos sin OC (luz y honorarios).
  {
    key: 'energia-patagonica',
    name: 'Energía Patagónica Cooperativa',
    tradeName: null,
    cuitPrefix: '3070555111',
    vat: 1,
    city: 'Neuquén',
    paymentDays: 15,
    categories: [],
    contact: { name: 'Mesa de ayuda', role: 'Atención a empresas' },
    arcaExpiry: 240,
  },
  {
    key: 'estudio-ramirez',
    name: 'Estudio Contable Ramírez',
    tradeName: null,
    cuitPrefix: '2027888999',
    vat: 6,
    city: 'Neuquén',
    paymentDays: 10,
    categories: [],
    contact: { name: 'Laura Ramírez', role: 'Titular' },
    arcaExpiry: 200,
  },
];

/** CUIT valido a partir de 10 digitos (misma regla que `isValidCuit`). */
export function demoCuit(prefix10: string): bigint {
  const coefficients = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = coefficients.reduce((acc, c, i) => acc + c * Number(prefix10[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) throw new Error(`El prefijo ${prefix10} no tiene CUIT valido: elegi otro`);
  return BigInt(`${prefix10}${check}`);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

export async function seedPurchases(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;

  // ── Rubros y proveedores ──────────────────────────────────────────────────
  await tx.supplier_categories.createMany({
    data: CATEGORIES.map((name) => ({ id: demoId('supplier_category', name), company_id: company.id, name })),
  });

  const suppliers: Prisma.suppliersCreateManyInput[] = [];
  const contacts: Prisma.supplier_contactsCreateManyInput[] = [];
  const links: Prisma.supplier_category_linksCreateManyInput[] = [];
  const documents: Prisma.supplier_documentsCreateManyInput[] = [];
  for (const s of SUPPLIERS) {
    const id = demoId('supplier', s.key);
    suppliers.push({
      id,
      company_id: company.id,
      name: s.name,
      trade_name: s.tradeName,
      cuit: demoCuit(s.cuitPrefix),
      vat_condition_id: s.vat,
      city: s.city,
      province: 'Neuquén',
      payment_term_days: s.paymentDays,
      created_at: cal.at(-200, 9),
      updated_at: cal.at(-200, 9),
    });
    const domain = `${slug(s.tradeName ?? s.name)
      .split('-')
      .slice(0, 2)
      .join('')}.test`;
    contacts.push({
      id: demoId('supplier_contact', s.key),
      supplier_id: id,
      name: s.contact.name,
      email: `${slug(s.contact.name).split('-')[0]}@${domain}`,
      phone: `299 4${String(100000 + suppliers.length * 7919).slice(-6)}`,
      role: s.contact.role,
      is_primary: true,
    });
    for (const category of s.categories)
      links.push({ supplier_id: id, category_id: demoId('supplier_category', category) });

    // Constancia de inscripcion de ARCA con su vencimiento (algunas vencidas o por vencer).
    const key = `${company.id}/${id}/constancia-arca.pdf`;
    documents.push({
      id: demoId('supplier_document', s.key),
      supplier_id: id,
      name: 'Constancia de inscripción ARCA',
      file_path: key,
      file_name: 'constancia-arca.pdf',
      expires_at: new Date(`${cal.ymd(s.arcaExpiry)}T00:00:00.000Z`),
      uploaded_by: actorId,
      created_at: cal.at(-60, 10),
    });
    await addPdf(ctx, SUPPLIER_DOCUMENTS_BUCKET, key, {
      title: 'Constancia de inscripción',
      fields: [
        ['Razón social', s.name],
        ['CUIT', String(demoCuit(s.cuitPrefix))],
        ['Vencimiento', toDmy(cal.ymd(s.arcaExpiry))],
      ],
      body: 'Constancia de inscripción presentada por el proveedor.',
      reference: `${s.key}/arca`,
    });
  }
  await tx.suppliers.createMany({ data: suppliers });
  await tx.supplier_contacts.createMany({ data: contacts });
  await tx.supplier_category_links.createMany({ data: links });
  await tx.supplier_documents.createMany({ data: documents });

  // ── Solicitudes de compra ─────────────────────────────────────────────────
  const materials = await tx.materials.findMany({
    where: {
      company_id: company.id,
      is_active: true,
      tracking_type: 'QUANTITY',
      clothing_combination: null,
      tire_combination: null,
    },
    select: { id: true, unit_id: true },
    orderBy: { code: 'asc' },
    take: 6,
  });
  const unit = await tx.measurement_units.findFirstOrThrow({
    where: { company_id: company.id, abbreviation: 'u' },
    select: { id: true },
  });
  if (materials.length < 3) throw new Error('La demo de Compras necesita al menos 3 materiales de Almacenes');
  const byCode = new Map(
    (
      await tx.materials.findMany({
        where: { company_id: company.id, code: { in: ['GRA-LIT'] } },
        select: { id: true, unit_id: true, code: true },
      })
    ).map((m) => [m.code, m])
  );
  const supplierId = (key: string) => demoId('supplier', key);

  type Plan = {
    key: string;
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PARTIALLY_ORDERED' | 'ORDERED';
    day: number;
    notes: string;
    lines: { material?: number; materialCode?: string; description?: string; quantity: number; supplier?: string }[];
  };
  const plans: Plan[] = [
    {
      key: 'aprobada-lubricantes',
      status: 'PARTIALLY_ORDERED',
      day: -20,
      notes: 'Reposición mensual de lubricantes',
      lines: [
        { material: 0, quantity: 200, supplier: 'lubricantes-comahue' },
        { material: 1, quantity: 40 },
      ],
    },
    {
      key: 'aprobada-servicio',
      status: 'ORDERED',
      day: -12,
      notes: 'Equipo fuera de servicio',
      lines: [{ description: 'Rectificado de tapa de cilindros', quantity: 1, supplier: 'taller-andes' }],
    },
    // Etapa 3 (recepciones): grasa por lote recibida en parte, filtros con excedente y un servicio.
    {
      key: 'aprobada-grasa',
      status: 'ORDERED',
      day: -9,
      notes: 'Engrase de flota',
      lines: [{ materialCode: 'GRA-LIT', quantity: 30, supplier: 'lubricantes-comahue' }],
    },
    {
      key: 'aprobada-filtros',
      status: 'ORDERED',
      day: -8,
      notes: 'Service de 500 h',
      lines: [{ material: 2, quantity: 10, supplier: 'filtros-norte' }],
    },
    {
      key: 'aprobada-grua',
      status: 'ORDERED',
      day: -7,
      notes: 'Montaje del equipo de bombeo',
      lines: [{ description: 'Horas de grúa 30 t', quantity: 8, supplier: 'hidraulica-vaca-muerta' }],
    },
    {
      key: 'aprobada-cubiertas',
      status: 'PARTIALLY_ORDERED',
      day: -6,
      notes: 'Recambio del tractor 12',
      lines: [{ description: 'Cubierta 295/80 R22.5', quantity: 6, supplier: 'neumaticos-patagonia' }],
    },
    {
      key: 'pendiente',
      status: 'PENDING_APPROVAL',
      day: -3,
      notes: 'Stock bajo en el pañol',
      lines: [
        { material: 2, quantity: 10, supplier: 'ferreteria-industrial' },
        { description: 'Juego de llaves torque 1/2"', quantity: 1 },
      ],
    },
    {
      key: 'pendiente-hidraulica',
      status: 'PENDING_APPROVAL',
      day: -1,
      notes: 'Pérdida en el sistema hidráulico',
      lines: [{ description: 'Reparación de cilindro hidráulico', quantity: 1, supplier: 'hidraulica-vaca-muerta' }],
    },
    { key: 'borrador', status: 'DRAFT', day: 0, notes: 'Para el próximo mes', lines: [{ material: 1, quantity: 25 }] },
    {
      key: 'rechazada',
      status: 'REJECTED',
      day: -30,
      notes: 'Compra de herramientas',
      lines: [{ description: 'Amoladora angular 9"', quantity: 2, supplier: 'ferreteria-industrial' }],
    },
    { key: 'anulada', status: 'CANCELLED', day: -8, notes: 'Pedido duplicado', lines: [{ material: 0, quantity: 50 }] },
  ];

  const requests: Prisma.purchase_requestsCreateManyInput[] = [];
  const lines: Prisma.purchase_request_linesCreateManyInput[] = [];
  let seq = 0;
  const number = () => `SC-${String(++seq).padStart(6, '0')}`;
  for (const p of [...plans].sort((a, b) => a.day - b.day)) {
    const id = demoId('purchase_request', p.key);
    const submitted = p.status !== 'DRAFT';
    const decided = p.status !== 'DRAFT' && p.status !== 'PENDING_APPROVAL' && p.status !== 'CANCELLED';
    requests.push({
      id,
      company_id: company.id,
      number: number(),
      status: p.status,
      requested_by: actorId,
      needed_by: new Date(`${cal.ymd(p.day + 10)}T00:00:00.000Z`),
      notes: p.notes,
      submitted_at: submitted ? cal.at(p.day, 10) : null,
      decided_by: decided ? actorId : null,
      decided_at: decided ? cal.at(p.day + 1, 9) : null,
      decision_notes: p.status === 'REJECTED' ? 'Se usan las del pañol; no hace falta comprar' : null,
      cancelled_by: p.status === 'CANCELLED' ? actorId : null,
      cancelled_at: p.status === 'CANCELLED' ? cal.at(p.day, 12) : null,
      cancel_reason: p.status === 'CANCELLED' ? 'Cargada dos veces' : null,
      created_at: cal.at(p.day, 9),
      updated_at: cal.at(p.day, 12),
    });
    p.lines.forEach((l, i) => {
      const material = l.materialCode
        ? byCode.get(l.materialCode) ?? null
        : l.material !== undefined
          ? materials[l.material % materials.length]!
          : null;
      lines.push({
        request_id: id,
        position: i + 1,
        material_id: material?.id ?? null,
        description: material ? null : l.description!,
        quantity: l.quantity,
        unit_id: material?.unit_id ?? unit.id,
        suggested_supplier_id: l.supplier ? supplierId(l.supplier) : null,
      });
    });
  }

  // Una generada desde un pedido aprobado de Almacenes: mismo destino, materiales del pedido.
  const materialRequest = await tx.material_requests.findFirst({
    where: { company_id: company.id, status: { in: ['APPROVED', 'PARTIALLY_DELIVERED'] } },
    select: {
      id: true,
      number: true,
      destination_type: true,
      employee_id: true,
      vehicle_id: true,
      other_equipment_id: true,
      maintenance_order_id: true,
      customer_id: true,
      customer_service_id: true,
      lines: { select: { material_id: true, quantity: true, material: { select: { unit_id: true } } }, take: 2 },
    },
    orderBy: { number: 'asc' },
  });
  if (materialRequest) {
    const id = demoId('purchase_request', 'desde-pedido');
    requests.push({
      id,
      company_id: company.id,
      number: number(),
      status: 'PENDING_APPROVAL',
      requested_by: actorId,
      notes: `Faltante del pedido ${materialRequest.number}`,
      material_request_id: materialRequest.id,
      destination_type: materialRequest.destination_type,
      employee_id: materialRequest.employee_id,
      vehicle_id: materialRequest.vehicle_id,
      other_equipment_id: materialRequest.other_equipment_id,
      maintenance_order_id: materialRequest.maintenance_order_id,
      customer_id: materialRequest.customer_id,
      customer_service_id: materialRequest.customer_service_id,
      submitted_at: cal.at(-1, 15),
      created_at: cal.at(-1, 15),
      updated_at: cal.at(-1, 15),
    });
    materialRequest.lines.forEach((l, i) =>
      lines.push({
        request_id: id,
        position: i + 1,
        material_id: l.material_id,
        quantity: l.quantity,
        unit_id: l.material.unit_id,
      })
    );
  }

  await tx.purchase_requests.createMany({ data: requests });
  await tx.purchase_request_lines.createMany({ data: lines });
  const quotesAndOrders = await seedQuotesAndOrders(ctx, lines);
  const receipts = await seedReceipts(ctx);
  const invoices = await seedSupplierInvoices(ctx);
  const payments = await seedSupplierPayments(ctx);
  ctx.log(
    `compras: ${suppliers.length} proveedores, ${requests.length} solicitudes${materialRequest ? ` (una desde ${materialRequest.number})` : ''}, ${quotesAndOrders}, ${receipts}, ${invoices}, ${payments}`
  );
}
