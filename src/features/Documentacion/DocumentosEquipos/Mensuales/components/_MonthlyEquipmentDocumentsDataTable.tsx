'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { getDocumentDownloadUrls } from '@/features/Documentacion/shared/actions/document-files.server';
import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { LucideIcon } from 'lucide-react';
import { Check, CheckCircle2, CircleOff, Download, X } from 'lucide-react';
import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import {
  getAllMonthlyEquipmentDocumentsForExport,
  getMonthlyEquipmentDocumentsPaginated,
  getMonthlyEquipmentDocumentsSingleFacet,
  type MonthlyEquipmentDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, stateIcons, stateLabels } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: MonthlyEquipmentDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  equipmentId?: string;
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'vehicle', 'documentType', 'contractor'];

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, ComponentType<{ className?: string }> | undefined> | undefined,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        ...(icons?.[value] ? { icon: icons[value] as LucideIcon } : {}),
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin estado', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para FK/M:M: opciones del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// DOWNLOAD BUTTON — descarga ZIP con todos los documentos de la página actual
// ============================================================================

function MonthlyEquipmentDocumentsDownloadButton({ tableRows }: { tableRows: MonthlyEquipmentDocumentListItem[] }) {
  const downloadableRows = tableRows.filter(
    (row) => row.state !== 'pendiente' && row.document_path && row.archived_at == null
  );
  const pendingRows = tableRows.filter((row) => row.state === 'pendiente');

  const getVehicleLabel = (row: MonthlyEquipmentDocumentListItem) => {
    if (row.vehicles) {
      return row.vehicles.domain ?? row.vehicles.serie ?? row.vehicles.intern_number ?? 'Equipo';
    }
    return 'Equipo';
  };

  const handleDownloadAll = async () => {
    toast.promise(
      async () => {
        const zip = new JSZip();

        // Las URLs las resuelve el servidor (solo documentos de la empresa activa)
        const paths = downloadableRows.map((doc) => doc.document_path).filter((p): p is string => !!p);
        const signedUrls = new Map((await getDocumentDownloadUrls(paths)).map((item) => [item.path, item.url]));

        const files = await Promise.all(
          downloadableRows.map(async (doc) => {
            if (!doc.document_path) return null;
            const url = signedUrls.get(doc.document_path);
            if (!url) throw new Error('No se pudo generar el enlace de descarga');
            const response = await fetch(url);
            if (!response.ok) throw new Error('No se pudo descargar el documento');
            const data = await response.blob();

            const extension = doc.document_path.split('.').pop();
            const docTypeName = doc.document_types?.name ?? 'documento';
            const vehicleLabel = getVehicleLabel(doc);
            const period = doc.period ? `-(${doc.period})` : '';

            return {
              data,
              name: `${vehicleLabel}-(${docTypeName})${period}.${extension}`,
            };
          })
        );

        for (const file of files) {
          if (file) {
            zip.file(file.name, file.data);
          }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'documentos-mensuales-equipos.zip');
      },
      {
        loading: 'Descargando documentos...',
        success: 'Documentos descargados correctamente',
        error: (error) => error?.message ?? 'Error al descargar documentos',
      }
    );
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={downloadableRows.length === 0} size="sm" variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Descargar Documentos
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Descargar {downloadableRows.length} {downloadableRows.length === 1 ? 'documento' : 'documentos'}
          </AlertDialogTitle>
          <AlertDialogDescription className="max-h-[65vh] overflow-y-auto">
            {pendingRows.length > 0 && (
              <Accordion type="single" collapsible className="mb-2">
                <AccordionItem value="pending">
                  <AccordionTrigger className="text-destructive">
                    {pendingRows.length} {pendingRows.length === 1 ? 'documento pendiente' : 'documentos pendientes'}{' '}
                    (no se descargarán)
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {pendingRows.map((row) => (
                        <Card className="p-2 border-destructive/30" key={row.id}>
                          <CardDescription>
                            {row.vehicles
                              ? row.vehicles.domain ?? row.vehicles.serie ?? row.vehicles.intern_number ?? 'Equipo'
                              : 'Equipo'}{' '}
                            ({row.document_types?.name ?? 'Documento'})
                          </CardDescription>
                        </Card>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            <Accordion type="single" collapsible>
              <AccordionItem value="downloadable">
                <AccordionTrigger className="text-green-600">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {downloadableRows.length} {downloadableRows.length === 1 ? 'documento listo' : 'documentos listos'}{' '}
                    para descargar
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2 mt-2">
                    {downloadableRows.map((row) => (
                      <Card className="p-2 border-green-600/30" key={row.id}>
                        <CardDescription>
                          {row.vehicles
                            ? row.vehicles.domain ?? row.vehicles.serie ?? row.vehicles.intern_number ?? 'Equipo'
                            : 'Equipo'}{' '}
                          ({row.document_types?.name ?? 'Documento'}){row.period && ` - ${row.period}`}
                        </CardDescription>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDownloadAll}>Descargar documentos</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _MonthlyEquipmentDocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  equipmentId,
}: Props) {
  // ─── Client-side navigation: estado reactivo para export con filtros activos ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push)
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getMonthlyEquipmentDocumentsPaginated(params, equipmentId),
    [equipmentId]
  );

  // Merge column visibility: defaults + saved preferences
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Merge filter visibility
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'state',
      'vehicle',
      'documentType',
      'mandatory',
      'multiresource',
      'contractor',
      'period',
      'deny_reason',
      'created_at',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTER_IDS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories ─────────────────────────────────────────────────

  // Factory para enums
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, ComponentType<{ className?: string }> | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMonthlyEquipmentDocumentsSingleFacet(columnId, params, equipmentId);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    [equipmentId]
  );

  // Factory para FK/M:M
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMonthlyEquipmentDocumentsSingleFacet(columnId, params, equipmentId);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [equipmentId]
  );

  // Factory para booleanos (mandatory, multiresource)
  const makeBoolFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMonthlyEquipmentDocumentsSingleFacet(columnId, params, equipmentId);
        if (!result) return { options: [], counts: new Map() };
        return {
          options: [
            { value: 'true', label: trueLabel, icon: Check },
            { value: 'false', label: falseLabel, icon: X },
            ...(result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      };
    },
    [equipmentId]
  );

  // ─── Filtros facetados con lazy-load ───────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Estado (enum)
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('state', Object.keys(stateLabels), stateLabels, stateIcons),
      },

      // Equipo (texto libre — busca por dominio, serie o número interno)
      {
        columnId: 'vehicle',
        title: 'Equipo',
        type: 'text' as const,
        placeholder: 'Buscar por dominio, serie o N° interno...',
      },

      // Tipo de Documento (FK UUID → document_types)
      {
        columnId: 'documentType',
        title: 'Tipo de Documento',
        fetchFacet: makeFkFetchFacet('documentType', 'Sin tipo'),
      },

      // Mandatorio (booleano en document_types)
      {
        columnId: 'mandatory',
        title: 'Mandatorio',
        fetchFacet: makeBoolFetchFacet('mandatory', 'Mandatorio', 'No Mandatorio'),
      },

      // Multirecurso (booleano en document_types)
      {
        columnId: 'multiresource',
        title: 'Multirecurso',
        fetchFacet: makeBoolFetchFacet('multiresource', 'Multirecurso', 'No Multirecurso'),
      },

      // Afectación / Contractor (M:M a través de vehicles)
      {
        columnId: 'contractor',
        title: 'Afectado a',
        fetchFacet: makeFkFetchFacet('contractor', 'Sin afectar'),
      },

      // Período (texto libre)
      {
        columnId: 'period',
        title: 'Período',
        type: 'text' as const,
        placeholder: 'Buscar por período...',
      },

      // Motivo de rechazo (texto libre)
      {
        columnId: 'deny_reason',
        title: 'Motivo de rechazo',
        type: 'text' as const,
        placeholder: 'Buscar por motivo...',
      },

      // Fecha de subida (rango)
      {
        columnId: 'created_at',
        title: 'Subido el',
        type: 'dateRange' as const,
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, makeBoolFetchFacet]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      searchPlaceholder="Dominio o documento"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay documentos mensuales de equipos registrados"
      data-testid="monthly-equipment-documents-table"
      toolbarActions={<MonthlyEquipmentDocumentsDownloadButton tableRows={data} />}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['monthly-equipment-documents', equipmentId ?? '']}
      onStateChange={handleStateChange}
      exportConfig={{
        fetchAllData: () => getAllMonthlyEquipmentDocumentsForExport(currentParams, equipmentId),
        options: {
          filename: 'documentos-mensuales-equipos',
          title: 'Listado de Documentos Mensuales de Equipos',
          sheetName: 'Documentos Mensuales',
        },
        formatters: {
          vehicle: (val) => String(val ?? ''),
          documentType: (val) => String(val ?? ''),
          contractor: (val) => String(val ?? ''),
          state: (val, row) =>
            row.archived_at != null ? 'Ya no aplica (historial)' : stateLabels[val as string] ?? String(val ?? ''),
          mandatory: (val) => (val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : ''),
          multiresource: (val) =>
            val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : '',
          period: (val) => String(val ?? '-'),
          created_at: (val) => (val ? formatArgentinaDay(val as string) : ''),
          deny_reason: (val) => String(val ?? '-'),
        },
      }}
    />
  );
}
