'use server';

import { preparte_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { preparteCompanyScope } from '../lib/preparte-scope';
import moment from 'moment';

const logger = new Logger('features/Operaciones/Preparte/report');

// ── Reporte de Preparte ──────────────────────────────────────────────────

export type PreparteReportFilters = {
  from: string; // ISO date string YYYY-MM-DD
  to: string; // ISO date string YYYY-MM-DD
  clientIds?: string[];
  statuses?: preparte_status[];
  groupBy: 'line' | 'order';
};

export type PreparteReportDetail = {
  id: string;
  numero_pedido: string | null;
  clientName: string;
  contractName: string;
  itemName: string | null;
  requestDate: string | null;
  executionDate: string | null;
  status: string;
  solicitante: string;
  observaciones: string | null;
  motivo: string | null;
};

export type PreparteClientSummary = {
  clientName: string;
  total: number;
  byStatus: Record<string, { count: number; percentage: number }>;
  lostPercentage: number;
};

export type PreparteReportSummary = {
  from: string;
  to: string;
  clientSummaries: PreparteClientSummary[];
  total: number;
  byStatus: Record<string, { count: number; percentage: number }>;
  lostPercentage: number;
};

export type PreparteReportResult = {
  summary: PreparteReportSummary;
  details: PreparteReportDetail[];
};

export async function getPreparteReportData(filters: PreparteReportFilters): Promise<PreparteReportResult> {
  logger.info('Generando reporte de preparte', { data: { filters } });

  try {
    const fromDate = new Date(`${filters.from}T00:00:00Z`);
    const toDate = new Date(`${filters.to}T23:59:59Z`);

    // Perímetro: sólo pedidos de la empresa activa (los viejos sin company_id siguen
    // visibles, mismo criterio que el resto del módulo).
    const companyId = await getActiveCompanyId();

    const where: Record<string, unknown> = {
      AND: [preparteCompanyScope(companyId)],
      OR: [
        { executionDate: { gte: fromDate, lte: toDate } },
        {
          executionDate: null,
          requestDate: { gte: fromDate, lte: toDate },
        },
      ],
    };

    if (filters.clientIds && filters.clientIds.length > 0) {
      where.cliente_id = { in: filters.clientIds };
    }

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }

    const data = await prisma.preparte.findMany({
      where,
      select: {
        id: true,
        numero_pedido: true,
        status: true,
        solicitante: true,
        observaciones: true,
        executionDate: true,
        requestDate: true,
        cancel_reason: true,
        rejected_reason: true,
        reprogram_reason: true,
        cancelled_by: true,
        rejected_by: true,
        reprogrammed_by: true,
        confirmed_by: true,
        customers: { select: { name: true } },
        customer_services: { select: { service_name: true } },
        service_items: { select: { item_name: true } },
      },
      orderBy: [{ status: 'asc' }, { executionDate: 'asc' }],
    });

    const total = data.length;

    // Helper para calcular estadísticas de un grupo de registros
    function computeStats(rows: typeof data) {
      const count = rows.length;
      const statusCounts: Record<string, number> = {};
      for (const row of rows) {
        const s = row.status || 'sin_estado';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
      const byStatus: Record<string, { count: number; percentage: number }> = {};
      for (const [status, c] of Object.entries(statusCounts)) {
        byStatus[status] = {
          count: c,
          percentage: count > 0 ? Math.round((c / count) * 10000) / 100 : 0,
        };
      }
      const rechazadoCount = statusCounts['rechazado'] || 0;
      const vencidoCount = statusCounts['vencido'] || 0;
      const lostPercentage = count > 0 ? Math.round(((rechazadoCount + vencidoCount) / count) * 10000) / 100 : 0;
      return { total: count, byStatus, lostPercentage };
    }

    // Agrupar por cliente
    const clientGroups = new Map<string, typeof data>();
    for (const row of data) {
      const clientName = row.customers?.name || 'Sin cliente';
      const group = clientGroups.get(clientName) || [];
      group.push(row);
      clientGroups.set(clientName, group);
    }

    // Resumen por cliente
    const clientSummaries: PreparteClientSummary[] = [...clientGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clientName, rows]) => ({
        clientName,
        ...computeStats(rows),
      }));

    // Totales globales
    const overallStats = computeStats(data);

    const summary: PreparteReportSummary = {
      from: filters.from,
      to: filters.to,
      clientSummaries,
      total,
      byStatus: overallStats.byStatus,
      lostPercentage: overallStats.lostPercentage,
    };

    const details: PreparteReportDetail[] = data.map((row) => {
      const status = row.status || 'sin_estado';
      let motivo: string | null = null;
      if (status === 'cancelado') motivo = row.cancel_reason ?? null;
      else if (status === 'rechazado') motivo = row.rejected_reason ?? null;
      else if (status === 'reprogramado') motivo = row.reprogram_reason ?? null;
      else if (status === 'vencido') motivo = 'Vencido sin confirmar a tiempo';

      return {
        id: row.id,
        numero_pedido: row.numero_pedido,
        clientName: row.customers?.name || '-',
        contractName: row.customer_services?.service_name || '-',
        itemName: row.service_items?.item_name || null,
        requestDate: row.requestDate ? moment(row.requestDate).format('DD/MM/YYYY') : null,
        executionDate: row.executionDate ? moment(row.executionDate).format('DD/MM/YYYY') : null,
        status,
        solicitante: row.solicitante,
        observaciones: row.observaciones,
        motivo,
      };
    });

    return { summary, details };
  } catch (error) {
    logger.error('Error generando reporte de preparte', { data: { error } });
    throw error;
  }
}
