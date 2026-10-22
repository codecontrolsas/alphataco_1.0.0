'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import type { DataTableFilterUpdates } from '@/shared/components/common/DataTable/useDataTableFilter';
import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';
import { DATA_TABLE_URL_CHANGE_EVENT } from '@/shared/components/common/DataTable/useDataTable';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener(DATA_TABLE_URL_CHANGE_EVENT, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(DATA_TABLE_URL_CHANGE_EVENT, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const getSearch = () => window.location.search;
const getServerSearch = () => '';

interface Props {
  tableId: string;
  tone: 'warn' | 'danger';
  title: ReactNode;
  description?: ReactNode;
  /** Filtros que deja aplicados el botón (columna → valor). */
  filters: DataTableFilterUpdates;
  buttonLabel: string;
}

/**
 * Banda de atención sobre una tabla de Tesorería: el número del título es el del contador de la
 * sub-navegación y el botón deja en la tabla exactamente esa lista (mismos filtros que el `where` del
 * contador). Sin título no se renderiza. Con los filtros ya aplicados el botón desaparece.
 */
export function TreasuryAttentionBanner({ tableId, tone, title, description, filters, buttonLabel }: Props) {
  const [, , setFilters] = useDataTableFilter(tableId, Object.keys(filters)[0] ?? 'status');
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const params = new URLSearchParams(search);
  const applied = Object.entries(filters).every(([column, value]) => {
    const expected = Array.isArray(value) ? value.join(',') : (value ?? null);
    return (params.get(`${tableId}${PARAM_SEPARATOR}${column}`) || null) === (expected || null);
  });

  return (
    <AttentionBanner
      live
      tone={tone}
      title={title}
      description={description}
      actions={
        applied ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setFilters(filters)}>
            {buttonLabel}
          </Button>
        )
      }
    />
  );
}
