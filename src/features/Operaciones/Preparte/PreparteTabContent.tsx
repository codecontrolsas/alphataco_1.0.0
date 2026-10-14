import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { PreparteList } from './list/PreparteList';

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export default function PreparteTabContent({ searchParams, permissionsMap }: Props) {
  return <PreparteList searchParams={searchParams} permissionsMap={permissionsMap} />;
}
