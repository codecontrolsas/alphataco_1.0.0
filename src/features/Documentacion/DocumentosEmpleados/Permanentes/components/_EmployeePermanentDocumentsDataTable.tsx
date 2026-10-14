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
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  getAllEmployeePermanentDocumentsForExport,
  getEmployeePermanentDocumentsPaginated,
  getEmployeePermanentDocumentsSingleFacet,
  type EmployeePermanentDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, stateIcons, stateLabels } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: EmployeePermanentDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  /** Si se provee, filtra documentos de un empleado específico */
  employeeId?: string;
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'employee', 'fileNumber', 'document_type'];

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        icon: icons[value],
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

function PermanentDocumentsDownloadButton({ tableRows }: { tableRows: EmployeePermanentDocumentListItem[] }) {
  const downloadableRows = tableRows.filter(
    (row) => row.state !== 'pendiente' && row.document_path && row.archived_at == null
  );
  const pendingRows = tableRows.filter((row) => row.state === 'pendiente');

  const getEmployeeName = (row: EmployeePermanentDocumentListItem) => {
    if (row.employees) {
      return `${row.employees.lastname}_${row.employees.firstname}`;
    }
    return 'Empleado';
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
            const employeeName = getEmployeeName(doc);

            return {
              data,
              name: `${employeeName}-(${docTypeName}).${extension}`,
            };
          })
        );

        for (const file of files) {
          if (file) {
            zip.file(file.name, file.data);
          }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'documentos-permanentes.zip');
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
          <AlertDialogDescription asChild>
            <div className="max-h-[65vh] overflow-y-auto">
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
                              {row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : 'Empleado'} (
                              {row.document_types?.name ?? 'Documento'})
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
                      {downloadableRows.length}{' '}
                      {downloadableRows.length === 1 ? 'documento listo' : 'documentos listos'} para descargar
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2 mt-2">
                      {downloadableRows.map((row) => (
                        <Card className="p-2 border-green-600/30" key={row.id}>
                          <CardDescription>
                            {row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : 'Empleado'} (
                            {row.document_types?.name ?? 'Documento'})
                          </CardDescription>
                        </Card>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
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

export function _EmployeePermanentDocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  employeeId,
}: Props) {
  // ─── Client-side navigation: estado reactivo para export con filtros activos ─
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeePermanentDocumentsPaginated(params, employeeId),
    [employeeId]
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
      'employee',
      'fileNumber',
      'document_type',
      'mandatory',
      'multiresource',
      'validity',
      'created_at',
      'deny_reason',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTER_IDS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories ─────────────────────────────────────────────────

  /** Factory para filtros de enum (estado) */
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeePermanentDocumentsSingleFacet(columnId, params, employeeId);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    [employeeId]
  );

  /** Factory para filtros de FK (tipo de documento) */
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeePermanentDocumentsSingleFacet(columnId, params, employeeId);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
      };
    },
    [employeeId]
  );

  /** Factory para filtros booleanos (mandatory, multiresource) */
  const makeBooleanFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeePermanentDocumentsSingleFacet(columnId, params, employeeId);
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
    [employeeId]
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

      // Empleado (texto libre — busca por nombre y apellido)
      {
        columnId: 'employee',
        title: 'Empleado',
        type: 'text' as const,
        placeholder: 'Buscar por nombre o apellido...',
      },

      // Legajo (coincidencia exacta — filtro separado del empleado)
      {
        columnId: 'fileNumber',
        title: 'Legajo',
        type: 'text' as const,
        placeholder: 'Ingrese el legajo completo...',
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
        fetchFacet: makeBooleanFetchFacet('mandatory', 'Mandatorio', 'No Mandatorio'),
      },

      // Multirecurso (booleano en document_types)
      {
        columnId: 'multiresource',
        title: 'Multirecurso',
        fetchFacet: makeBooleanFetchFacet('multiresource', 'Multirecurso', 'No Multirecurso'),
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
        placeholder: 'Buscar por motivo...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, makeBooleanFetchFacet]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['employee-permanent-docs', employeeId ?? '']}
      onStateChange={handleStateChange}
      searchPlaceholder="Legajo, empleado o documento"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      emptyMessage="No hay documentos permanentes de empleados registrados"
      data-testid="employee-permanent-documents-table"
      toolbarActions={<PermanentDocumentsDownloadButton tableRows={data} />}
      exportConfig={{
        fetchAllData: () => getAllEmployeePermanentDocumentsForExport(currentParams, employeeId),
        options: {
          filename: 'documentos-permanentes-empleados',
          title: 'Documentos Permanentes de Empleados',
          sheetName: 'Documentos',
        },
        formatters: {
          employee: (val) => String(val ?? ''),
          fileNumber: (val) => String(val ?? ''),
          document_type: (val) => String(val ?? ''),
          state: (val, row) =>
            row.archived_at != null ? 'Ya no aplica (historial)' : stateLabels[val as string] ?? String(val ?? ''),
          mandatory: (val) => (val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : ''),
          multiresource: (val) =>
            val === true || val === 'true' ? 'Sí' : val === false || val === 'false' ? 'No' : '',
          validity: (val) => (val ? formatArgentinaDay(val as string) : ''),
          created_at: (val) => (val ? formatArgentinaDay(val as string) : ''),
          deny_reason: (val) => String(val ?? '-'),
        },
      }}
    />
  );
}
