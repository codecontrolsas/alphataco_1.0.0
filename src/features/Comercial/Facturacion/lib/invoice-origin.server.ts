import 'server-only';

import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';

/**
 * Cadena de origen de un comprobante: pedido -> partes diarios -> certificación -> factura.
 *
 * Se arma con las relaciones que ya existen, sin tocar el esquema:
 * `invoice_certifications` -> `certification_lines.dailyreportrow_id` -> `dailyreportrows`
 * (-> `dailyreport` = parte del día, y -> `preparte` = pedido del planificador, cuyo `numero_pedido`
 * es el "PED-NNNN"). Cinco consultas fijas en paralelo, todas acotadas por empresa, con `select`
 * mínimo y sin importar cuántas líneas tenga la certificación (los pedidos y los días son pocos).
 */

export interface InvoiceOrigin {
  /** `PED-NNNN` de los pedidos de los que salen los partes, ordenados. Vacío si ningún parte nació de un pedido. */
  orders: string[];
  /** Partes diarios (uno por día) que alimentan las certificaciones del comprobante. */
  reports: {
    count: number;
    first: { id: string; date: string } | null;
    last: { id: string; date: string } | null;
  };
  /** Líneas de las certificaciones y cuántas conservan su parte de origen (un parte borrado deja la línea suelta). */
  lines: { total: number; withReport: number };
}

export async function loadInvoiceOrigin(
  certificationIds: readonly string[],
  companyId: string
): Promise<InvoiceOrigin> {
  const ids = [...certificationIds];
  if (ids.length === 0) {
    return { orders: [], reports: { count: 0, first: null, last: null }, lines: { total: 0, withReport: 0 } };
  }
  const ofCertifications = { certification_id: { in: ids }, certifications: { company_id: companyId } };

  const [reports, preparteOrders, total, withReport] = await Promise.all([
    prisma.dailyreport.findMany({
      where: {
        company_id: companyId,
        dailyreportrows: { some: { certification_lines: { some: ofCertifications } } },
      },
      select: { id: true, date: true },
      orderBy: { date: 'asc' },
    }),
    prisma.preparte.findMany({
      where: {
        company_id: companyId,
        numero_pedido: { not: null },
        dailyreportrows: { is: { certification_lines: { some: ofCertifications } } },
      },
      select: { numero_pedido: true },
      distinct: ['numero_pedido'],
      orderBy: { numero_pedido: 'asc' },
    }),
    prisma.certification_lines.count({ where: ofCertifications }),
    prisma.certification_lines.count({ where: { ...ofCertifications, dailyreportrow_id: { not: null } } }),
  ]);

  const toReport = (row: { id: string; date: Date } | undefined) =>
    row ? { id: row.id, date: toDateOnly(row.date) ?? '' } : null;

  return {
    orders: preparteOrders.flatMap((row) => (row.numero_pedido ? [row.numero_pedido] : [])),
    reports: { count: reports.length, first: toReport(reports[0]), last: toReport(reports[reports.length - 1]) },
    lines: { total, withReport },
  };
}
