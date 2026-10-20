'use client';

import { CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Network } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { getOrgChart, type OrgChartCargo, type OrgChartData } from '../actions.server';
import { buildOrgChartTree } from '../lib/org-chart-tree';
import { CargoForm, ORG_CHART_QUERY_KEY } from './CargoForm';
import { OrgChartTree } from './OrgChartTree';
import { OrgChartPlanSkeleton } from '../fallback/OrgChartSkeleton';

// El plano trae el kit isométrico y su geometría: se carga solo en pantallas anchas, donde se muestra.
const OrgChartPlan = dynamic(() => import('./plan/OrgChartPlan').then((m) => m.OrgChartPlan), {
  ssr: false,
  loading: () => <OrgChartPlanSkeleton />,
});

const WIDE_QUERY = '(min-width: 1024px)';

function subscribeWide(onChange: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** `true` en pantallas de 1024 px o más. En el servidor, `false`: el árbol se pinta siempre. */
function useIsWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}

interface OrgChartClientProps {
  initialData: OrgChartData;
  permissions: Record<string, boolean>;
}

export function OrgChartClient({ initialData, permissions }: OrgChartClientProps) {
  const canCreate = permissions['configuracion:org-chart:create'] === true;
  const canUpdate = permissions['configuracion:org-chart:update'] === true;
  const canDelete = permissions['configuracion:org-chart:delete'] === true;

  const { data, isError, refetch } = useQuery({
    queryKey: ORG_CHART_QUERY_KEY,
    queryFn: () => getOrgChart(),
    initialData,
    staleTime: 60 * 1000,
  });

  const isWide = useIsWide();
  const [activeCargoId, setActiveCargoId] = useState<string | null>(null);
  const [createSectorId, setCreateSectorId] = useState<string | null>(null);

  const sheet = useCatalogSheet<OrgChartCargo>({ canCreate, canUpdate });
  const { openCreate, openEdit } = sheet;

  const roots = useMemo(() => buildOrgChartTree(data), [data]);
  const sectorName = useMemo(() => new Map(data.sectors.map((sector) => [sector.id, sector.name])), [data.sectors]);
  const issueCount = useMemo(() => data.cargos.filter((cargo) => cargo.issues.length > 0).length, [data.cargos]);

  const handleCreate = useCallback(
    (sectorId: string) => {
      setCreateSectorId(sectorId);
      openCreate();
    },
    [openCreate]
  );

  // El plano entrega ids; el cargo editado se busca en los datos vigentes.
  const handleEditById = useCallback(
    (id: string) => {
      const cargo = data.cargos.find((item) => item.id === id);
      if (cargo && canUpdate) openEdit(cargo);
    },
    [data.cargos, canUpdate, openEdit]
  );

  if (isError) {
    return (
      <StateBlock
        variant="error"
        title="No se pudo cargar el organigrama"
        description="Revisá la conexión e intentá de nuevo."
        action={
          <button type="button" className="text-sm underline" onClick={() => refetch()}>
            Reintentar
          </button>
        }
      />
    );
  }

  if (data.sectors.length === 0) {
    return (
      <StateBlock
        variant="empty"
        icon={Network}
        title="Todavía no hay sectores"
        description="El organigrama se arma sobre los sectores: cargalos en la lista de Sectores, más abajo, y después agregá sus cargos acá."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* La región existe siempre: una que se monta de golpe no la anuncian los lectores de pantalla. */}
      <div role="status" aria-live="polite">
        {issueCount > 0 ? (
          <p className="text-destructive flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {issueCount === 1
              ? '1 cargo quedó desfasado (titular, puesto o sector). Está marcado en la lista.'
              : `${issueCount} cargos quedaron desfasados (titular, puesto o sector). Están marcados en la lista.`}
          </p>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        {isWide ? (
          <OrgChartPlan
            roots={roots}
            data={data}
            sectorName={sectorName}
            activeCargoId={activeCargoId}
            onActivateCargo={setActiveCargoId}
            onOpenCargo={handleEditById}
            canUpdate={canUpdate}
          />
        ) : null}
        <div className="min-w-0 lg:max-h-[42rem] lg:overflow-y-auto lg:pr-1">
          <OrgChartTree
            roots={roots}
            sectorName={sectorName}
            canCreate={canCreate}
            canUpdate={canUpdate}
            activeCargoId={activeCargoId}
            onActivateCargo={setActiveCargoId}
            onEditCargo={openEdit}
            onCreateCargo={handleCreate}
          />
        </div>
      </div>

      <CatalogFormSheet
        sheet={sheet}
        getKey={(cargo) => cargo.id}
        title={{ create: 'Nuevo cargo', edit: 'Editar cargo' }}
        description={{
          create: createSectorId ? `En ${sectorName.get(createSectorId) ?? 'el sector'}` : undefined,
          edit: 'Puesto, línea de reporte y titular',
        }}
        size="md"
      >
        {({ mode, item }) => (
          <CargoForm
            data={data}
            cargo={mode === 'edit' ? item : null}
            defaultSectorId={mode === 'create' ? createSectorId : null}
            canDelete={canDelete}
          />
        )}
      </CatalogFormSheet>
    </div>
  );
}
