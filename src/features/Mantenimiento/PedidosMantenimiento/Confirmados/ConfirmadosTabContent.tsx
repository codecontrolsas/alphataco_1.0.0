import type { DataTableSearchParams } from '@/shared/components/common/DataTable';
import { ConfirmedOrderList } from './ConfirmedOrderList';

/**
 * Paso "Por Ingresar": pedidos con fecha confirmada (`date_confirmed`) a la espera de que el equipo llegue al taller.
 * Arriba va la banda de atención con los pedidos cuya fecha ya pasó sin registrar el ingreso.
 */

interface ConfirmadosTabContentProps {
  searchParams?: DataTableSearchParams;
}

export async function ConfirmadosTabContent({ searchParams = {} }: ConfirmadosTabContentProps) {
  return <ConfirmedOrderList searchParams={searchParams} />;
}
