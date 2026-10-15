import { Card, CardContent } from '@/components/ui/card';
import { DailyReportRowFormRefactored } from '@/features/Operaciones/Certificacion/components/DailyReportRowFormRefactored';
import { CertificationList } from '@/features/Operaciones/Certificacion/list/CertificationList';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

interface Props {
  searchParams: DataTableSearchParams;
}

/**
 * Tab "Partes Diarios" de Comercial (Server Component): el tablero de líneas paginado en el
 * servidor y el formulario de alta/edición de línea, que se abre desde el store (sin props).
 */
export default function DailyReportWrapper({ searchParams }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <CertificationList searchParams={searchParams} />
      </CardContent>
      <DailyReportRowFormRefactored />
    </Card>
  );
}
