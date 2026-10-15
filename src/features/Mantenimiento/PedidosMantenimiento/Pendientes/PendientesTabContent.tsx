import type { DataTableSearchParams } from '@/shared/components/common/DataTable';
import { PendingOrderList } from './PendingOrderList';

/**
 * Paso "Por Programar": pedidos aprobados que esperan fecha de ingreso al taller.
 *
 * Por defecto lista los `pending_scheduling`; el filtro de Estado también ofrece `scheduled` (ya planificados).
 * Arriba van la banda de atención y las tarjetas de métricas, que filtran la tabla vía `attention`.
 */

interface PendientesTabContentProps {
  searchParams?: DataTableSearchParams;
}

export async function PendientesTabContent({ searchParams = {} }: PendientesTabContentProps) {
  return <PendingOrderList searchParams={searchParams} />;
}
