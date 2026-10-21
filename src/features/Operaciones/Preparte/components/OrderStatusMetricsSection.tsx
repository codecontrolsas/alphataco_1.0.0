import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { Suspense } from 'react';
import { OrderStatusMetricsSkeleton } from '../fallback/OrderStatusMetricsSkeleton';
import { OrderStatusMetrics, type OrderMetricStatus, type OrderStatusCounts } from './OrderStatusMetrics';

const logger = new Logger('features/Operaciones/Preparte/OrderStatusMetricsSection');

const METRIC_STATUSES: OrderMetricStatus[] = ['pendiente', 'confirmado', 'reprogramado', 'rechazado', 'vencido'];

/**
 * Cuenta los pedidos por estado de la empresa activa. Un COUNT por estado, en paralelo.
 * Se llama sin `await` desde la lista para que arranque junto con la tabla: por eso nunca
 * rechaza. Si falla devuelve `null` y las tarjetas muestran "—" en lugar de romper la pantalla.
 */
export async function getOrderStatusCounts(): Promise<OrderStatusCounts | null> {
  try {
    const companyId = await getActiveCompanyId();
    const results = await Promise.all(
      METRIC_STATUSES.map((status) =>
        prisma.preparte.count({
          where: { company_id: companyId, status },
        })
      )
    );
    return Object.fromEntries(METRIC_STATUSES.map((status, index) => [status, results[index]])) as OrderStatusCounts;
  } catch (error) {
    logger.error('Error al contar los pedidos por estado', { data: { error } });
    return null;
  }
}

async function Metrics({
  counts,
  serverStatus,
}: {
  counts: Promise<OrderStatusCounts | null>;
  serverStatus: string | null;
}) {
  return <OrderStatusMetrics counts={await counts} serverStatus={serverStatus} />;
}

/** Server Component: resuelve las tarjetas en su propio Suspense, sin frenar la tabla. */
export function OrderStatusMetricsSection({
  counts,
  serverStatus = null,
}: {
  counts: Promise<OrderStatusCounts | null>;
  serverStatus?: string | null;
}) {
  return (
    <Suspense fallback={<OrderStatusMetricsSkeleton />}>
      <Metrics counts={counts} serverStatus={serverStatus} />
    </Suspense>
  );
}
