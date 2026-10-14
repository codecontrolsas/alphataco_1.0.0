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
import { contractTypeVehiclesLabels } from '@/shared/utils/mappers';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { Check, CheckCircle2, CircleOff, Download, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, stateIcons, stateLabels } from '../columns';
import { getEquipmentPermanentDocumentsSingleFacet } from '../facets.server';
import {
  getAllEquipmentPermanentDocumentsForExport,
  getEquipmentPermanentDocumentsPaginated,
  type EquipmentPermanentDocumentListItem,
} from '../queries.server';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: EquipmentPermanentDocumentListItem[];
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

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'vehicle', 'document_type', 'contractor'];

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, React.ComponentType<{ className?: string }> | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        // LucideIcon es compatible en runtime; el cast evita incompatibilidad de tipos estructurales
        ...(icons[value] ? { icon: icons[value] as import('lucide-react').LucideIcon } : {}),
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin estado', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para FK: opciones del servidor + counts */
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
// DOWNLOAD BUTTON
// ============================================================================

function EquipmentDocumentsDownloadButton({ tableRows }: { tableRows: EquipmentPermanentDocumentListItem[] }) {
  const downloadableRows = tableRows.filter(
    (row) => row.state !== 'pendiente' && row.document_path && row.archived_at == null
  );
  const pendingRows = tableRows.filter((row) => row.state === 'pendiente');

  const getVehicleLabel = (row: EquipmentPermanentDocumentListItem) => {
    const v = row.vehicles;
    if (!v) return 'Equipo';
    return v.domain ?? v.serie ?? v.intern_number ?? 'Equipo';
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

            return {
              data,
              name: `${vehicleLabel}-(${docTypeName}).${extension}`,
            };
          })
        );

        for (const file of files) {
          if (file) {
            zip.file(file.name, file.data);
          }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'documentos-permanentes-equipos.zip');
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
                            {getVehicleLabel(row)} ({row.document_types?.name ?? 'Documento'})
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
                          {getVehicleLabel(row)} ({row.document_types?.name ?? 'Documento'})
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

export function _EquipmentPermanentDocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  equipmentId,
}: Props) {
  // ─── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEquipmentPermanentDocumentsPaginated(params, equipmentId),
    [equipmentId]
  );

  // ─── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── Filter visibility ─────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'state',
      'vehicle',
      'document_type',
      'mandatory',
      'multiresource',
      'contractor',
      'validity',
      'created_at',
      'deny_reason',
      'serie',
      'policy_number',
      // Nuevos filtros de datos del equipo
      'vehicle_type',
      'vehicle_subtype',
      'vehicle_brand',
      'vehicle_year',
      'vehicle_owner',
      'vehicle_sector',
      'vehicle_chassis',
      'vehicle_engine',
      'vehicle_contract_type',
      'vehicle_contract_expiration',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTER_IDS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories ──────────────────────────────────────────────────

  /** Factory para filtros de enum */
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, React.ComponentType<{ className?: string }> | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEquipmentPermanentDocumentsSingleFacet(columnId, params, equipmentId);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    [equipmentId]
  );

  /** Factory para filtros de FK con opciones resueltas del servidor */
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEquipmentPermanentDocumentsSingleFacet(columnId, params, equipmentId);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [equipmentId]
  );

  /** Factory para filtros booleanos (mandatory, multiresource) */
  const makeBoolFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEquipmentPermanentDocumentsSingleFacet(columnId, params, equipmentId);
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
      // Estado (enum state)
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('state', Object.keys(stateLabels), stateLabels, stateIcons),
      },

      // Dominio (texto libre — busca por dominio, serie o número interno)
      {
        columnId: 'vehicle',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio, serie o N° interno...',
      },

      // Tipo de documento (FK UUID → document_types)
      {
        columnId: 'document_type',
        title: 'Tipo de documento',
        fetchFacet: makeFkFetchFacet('document_type', 'Sin tipo'),
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

      // Afectado a (M:M contractor)
      {
        columnId: 'contractor',
        title: 'Afectado a',
        fetchFacet: makeFkFetchFacet('contractor', 'Sin afectar'),
      },

      // Vencimiento (rango de fechas)
      {
        columnId: 'validity',
        title: 'Vencimiento',
        type: 'dateRange' as const,
      },

      // Fecha de carga (rango de fechas)
      {
        columnId: 'created_at',
        title: 'Subido el',
        type: 'dateRange' as const,
      },

      // Motivo de rechazo (texto libre)
      {
        columnId: 'deny_reason',
        title: 'Motivo de rechazo',
        type: 'text' as const,
        placeholder: 'Buscar por motivo de rechazo...',
      },

      // Serie (vehicles.serie — texto libre)
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie del equipo...',
      },

      // N° de Póliza (documents_equipment.policy_number — texto libre)
      {
        columnId: 'policy_number',
        title: 'N° de Póliza',
        type: 'text' as const,
        placeholder: 'Buscar por N° de póliza...',
      },

      // Tipo del equipo (vehicles.type → type_vehicles_typeTotype)
      {
        columnId: 'vehicle_type',
        title: 'Tipo',
        fetchFacet: makeFkFetchFacet('vehicle_type', 'Sin tipo'),
      },

      // Subtipo del equipo (vehicles.subType → sub_type)
      {
        columnId: 'vehicle_subtype',
        title: 'Subtipo',
        fetchFacet: makeFkFetchFacet('vehicle_subtype', 'Sin subtipo'),
      },

      // Marca del equipo (vehicles.brand → brand_vehicles, Int)
      {
        columnId: 'vehicle_brand',
        title: 'Marca',
        fetchFacet: makeFkFetchFacet('vehicle_brand', 'Sin marca'),
      },

      // Año del equipo (vehicles.year — texto libre)
      {
        columnId: 'vehicle_year',
        title: 'Año',
        type: 'text' as const,
        placeholder: 'Buscar por año del equipo...',
      },

      // Propietario del equipo (vehicles.owner_id → equipment_owners)
      {
        columnId: 'vehicle_owner',
        title: 'Propietario',
        fetchFacet: makeFkFetchFacet('vehicle_owner', 'Sin propietario'),
      },

      // Sector del equipo (vehicles.sector → hierarchy)
      {
        columnId: 'vehicle_sector',
        title: 'Sector',
        fetchFacet: makeFkFetchFacet('vehicle_sector', 'Sin sector'),
      },

      // Chasis del equipo (vehicles.chassis — texto libre)
      {
        columnId: 'vehicle_chassis',
        title: 'Chasis',
        type: 'text' as const,
        placeholder: 'Buscar por chasis del equipo...',
      },

      // Motor del equipo (vehicles.engine — texto libre)
      {
        columnId: 'vehicle_engine',
        title: 'Motor',
        type: 'text' as const,
        placeholder: 'Buscar por motor del equipo...',
      },

      // Tipo de contrato (vehicles.type_of_contract — enum nullable)
      {
        columnId: 'vehicle_contract_type',
        title: 'Tipo de contrato',
        fetchFacet: makeEnumFetchFacet(
          'vehicle_contract_type',
          Object.keys(contractTypeVehiclesLabels),
          contractTypeVehiclesLabels,
          {}
        ),
      },

      // Vencimiento de contrato (vehicles.contract_expiration_date — rango de fechas)
      {
        columnId: 'vehicle_contract_expiration',
        title: 'Venc. de contrato',
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
      emptyMessage="No hay documentos permanentes de equipos registrados"
      data-testid="equipment-permanent-documents-table"
      toolbarActions={<EquipmentDocumentsDownloadButton tableRows={data} />}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['equipment-permanent-docs', equipmentId ?? 'all']}
      onStateChange={handleStateChange}
      exportConfig={{
        fetchAllData: () => getAllEquipmentPermanentDocumentsForExport(currentParams, equipmentId),
        options: {
          filename: 'documentos-permanentes-equipos',
          title: 'Documentos Permanentes de Equipos',
          sheetName: 'Documentos',
        },
        formatters: {
          vehicle: (val) => String(val ?? ''),
          document_type: (val) => String(val ?? ''),
          contractor: (val) => String(val ?? ''),
          state: (val, row) =>
            row.archived_at != null ? 'Ya no aplica (historial)' : stateLabels[val as string] ?? String(val ?? ''),
          mandatory: (val) => (val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : ''),
          multiresource: (val) =>
            val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : '',
          validity: (val) => (val ? formatArgentinaDay(val as string) : ''),
          created_at: (val) => (val ? formatArgentinaDay(val as string) : ''),
          deny_reason: (val) => String(val ?? '-'),
          policy_number: (val) => String(val ?? ''),
          // Nuevas columnas del equipo
          vehicle_type: (val) => String(val ?? ''),
          vehicle_subtype: (val) => String(val ?? ''),
          vehicle_brand: (val) => String(val ?? ''),
          vehicle_year: (val) => String(val ?? ''),
          vehicle_owner: (val) => String(val ?? ''),
          vehicle_sector: (val) => String(val ?? ''),
          vehicle_chassis: (val) => String(val ?? ''),
          vehicle_engine: (val) => String(val ?? ''),
          vehicle_contract_type: (val) => (val ? contractTypeVehiclesLabels[val as string] ?? String(val) : ''),
          vehicle_contract_expiration: (val) => (val ? formatArgentinaDay(val as string) : ''),
        },
      }}
    />
  );
}
