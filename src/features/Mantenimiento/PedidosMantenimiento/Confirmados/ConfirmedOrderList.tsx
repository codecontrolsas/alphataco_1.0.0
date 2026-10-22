import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getConfirmedOrderAttention } from '../actions/metrics.server';
import { ConfirmedAttention, type ConfirmedAttentionData } from '../components/ConfirmedAttention';
import { CONFIRMED_PARAM_NAMESPACE, CONFIRMED_TABLE_ID } from '../constants';
import { getConfirmedOrdersPaginated } from './actions.server';
import { _ConfirmedOrderDataTable } from './components/_ConfirmedOrderDataTable';

// ============================================================================
// TYPES
// ============================================================================

interface ConfirmedOrderListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENTS
// ============================================================================

/** Resuelve la banda de atención en su propio Suspense: no frena a la tabla (y sin avisos no ocupa lugar). */
async function ConfirmedAttentionSection({
  attention,
  serverAttention,
  canRegisterEntry,
}: {
  attention: Promise<ConfirmedAttentionData>;
  serverAttention: string | null;
  canRegisterEntry: boolean;
}) {
  return (
    <ConfirmedAttention
      initialAttention={await attention}
      serverAttention={serverAttention}
      canRegisterEntry={canRegisterEntry}
    />
  );
}

export async function ConfirmedOrderList({ searchParams }: ConfirmedOrderListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, CONFIRMED_PARAM_NAMESPACE);

  // La banda arranca antes de esperar la tabla. `getConfirmedOrderAttention` nunca rechaza (devuelve `null`
  // si falla), así que la promesa no queda sin manejar.
  const attention = getConfirmedOrderAttention();
  const attentionParam = tableParams.attention;
  const serverAttention = typeof attentionParam === 'string' ? attentionParam : null;

  const [{ data, total }, preferences, canApproveWorkshopEntry] = await Promise.all([
    getConfirmedOrdersPaginated(tableParams),
    getTablePreferences(CONFIRMED_TABLE_ID),
    checkPermissionServer('mantenimiento', 'pedidos_confirmados', 'update'),
  ]);

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <ConfirmedAttentionSection
          attention={attention}
          serverAttention={serverAttention}
          canRegisterEntry={canApproveWorkshopEntry}
        />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Por ingresar</CardTitle>
          <CardDescription>Registrá el ingreso del equipo al taller. Al ingresar se pide el kilometraje.</CardDescription>
        </CardHeader>
        <CardContent>
          <_ConfirmedOrderDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={CONFIRMED_TABLE_ID}
            paramNamespace={CONFIRMED_PARAM_NAMESPACE}
            canApproveWorkshopEntry={canApproveWorkshopEntry}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
