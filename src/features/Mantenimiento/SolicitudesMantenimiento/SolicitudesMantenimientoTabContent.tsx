import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { MaintenanceRequestList } from './MaintenanceRequestList';

interface SolicitudesMantenimientoTabContentProps {
  searchParams?: DataTableSearchParams;
}

export async function SolicitudesMantenimientoTabContent({
  searchParams = {},
}: SolicitudesMantenimientoTabContentProps) {
  return <MaintenanceRequestList searchParams={searchParams} />;
}
