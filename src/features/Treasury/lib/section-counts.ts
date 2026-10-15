import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { depositWarningCutoffs } from './checks-dates';
import { receivableStateSql, receivablesBaseSql } from './receivables';
import { treasuryToday } from './today';

/**
 * Contadores de la sub-navegación de Tesorería. Cada función va envuelta en `React.cache` (sin
 * argumentos) para que, dentro de un mismo request, la sección activa y su contador no repitan la
 * consulta. Cada una exige el permiso `view` de su sección y cuenta en la base con el mismo criterio
 * que la lista. `null` = sin permiso o no se pudo calcular: la UI muestra "—", nunca un 0 inventado.
 * Cuentas, Movimientos, Transferencias, Retenciones y Configuración no llevan contador.
 */

const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * Cobranzas = comprobantes vencidos a cobrar. Mismo criterio que el estado "Vencido" de "A cobrar":
 * saldo libre y vencimiento anterior a hoy; las deudas por cheque rechazado figuran siempre vencidas.
 * Lo que está entero reservado en un borrador no cuenta.
 */
export const getCollectionsSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const today = treasuryToday();
  // Misma subconsulta y misma regla de estado que la lista "A cobrar" filtrada por Vencido
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total FROM (${receivablesBaseSql(companyId)}) r
    WHERE ${receivableStateSql(today)} = 'OVERDUE'
  `;
  return Number(rows[0]?.total ?? 0);
});

/** Cheques = en cartera con el depósito vencido o por vencer (los dos avisos de la tabla). */
export const getChecksSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('tesoreria', 'cheques', 'view'))) return null;
  const { warnUntil } = depositWarningCutoffs(treasuryToday());
  return prisma.third_party_checks.count({
    where: { company_id: await getActiveCompanyId(), status: 'IN_PORTFOLIO', payment_date: { lte: dayDate(warnUntil) } },
  });
});

/** Cheques propios = emitidos cuya fecha de pago ya pasó: falta confirmar el débito (o el rechazo). */
export const getOwnChecksSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('tesoreria', 'cheques-propios', 'view'))) return null;
  return prisma.own_checks.count({
    where: { company_id: await getActiveCompanyId(), status: 'ISSUED', payment_date: { lt: dayDate(treasuryToday()) } },
  });
});

/** Conciliación = líneas de extracto pendientes de conciliar. */
export const getReconciliationSectionCount = cache(async (): Promise<number | null> => {
  if (!(await checkPermissionServer('tesoreria', 'conciliacion', 'view'))) return null;
  return prisma.bank_statement_lines.count({
    where: { company_id: await getActiveCompanyId(), status: 'PENDING' },
  });
});
