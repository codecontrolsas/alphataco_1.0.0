'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/features/Permissions';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Cliente, Contrato, PreparteItem } from '../types/entities';
import { _PreparteDataTable } from '../list/components/_PreparteDataTable';
import type { PreparteConfirmation, PreparteTableCallbacks } from '../list/columns';
import { PreparteBulkStatusModal } from './PreparteBulkStatusModal';
import { OrderConfirmDialog } from './order-detail/OrderConfirmDialog';
import { OrderDetailSheet } from './order-detail/OrderDetailSheet';
import { OrderStatusChangeDialog, type OrderStatusChangeValues } from './order-detail/OrderStatusChangeDialog';
import { PreparteForm, type PreparteFormData } from './PreparteForm';
import { PreparteReportModal } from './PreparteReportModal';
import { usePreparteActions } from '../hooks/usePreparteActions';
import { buildEditFormData } from '../lib/preparte-form-data';

import { fetchAllContracts } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import { fetchCustomersWithRelations } from '../actions/form-data.server';

// Compatibilidad: los tipos viven en `../types/entities`; se re-exportan para los imports existentes.
export type { Cliente, Contrato, PreparteItem } from '../types/entities';

/**
 * Único overlay abierto sobre la lista de pedidos. Al ser una unión, nunca hay dos a la vez:
 * reject/reprogram/cancel/confirm vuelven a `detail` con "Volver" (salvo la confirmación abierta
 * desde la tabla, que al cancelar simplemente cierra).
 */
export type OrderPanel =
  | { kind: 'detail' | 'edit' | 'reject' | 'reprogram' | 'cancel'; item: PreparteItem }
  | { kind: 'confirm'; item: PreparteItem; origin: 'table' | 'detail' }
  | null;

interface PreparteManagerProps {
  prepartes: PreparteItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas de la tabla (columnas y filtros visibles). */
  prefsId: string;
  /** Namespace de los params de la URL de la tabla. */
  namespace: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  statusCards?: React.ReactNode;
}

/** Clientes y contratos se piden recién cuando se abre la edición o el informe, y se reusan un buen rato. */
const LOOKUP_STALE_TIME = 10 * 60 * 1000;
const NO_CUSTOMERS: Cliente[] = [];
const NO_CONTRACTS: Contrato[] = [];

export function PreparteManager({
  prepartes,
  totalRows,
  searchParams,
  prefsId,
  namespace,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  statusCards,
}: PreparteManagerProps) {
  const [panel, setPanel] = useState<OrderPanel>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<PreparteItem[]>([]);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);

  // Último pedido abierto en edición: la key del form no cambia mientras el Sheet anima su cierre
  const [lastEditItem, setLastEditItem] = useState<PreparteItem | null>(null);
  if (panel?.kind === 'edit' && panel.item !== lastEditItem) setLastEditItem(panel.item);

  // Foco: el botón de la tabla que abrió el panel recupera el foco al cerrarlo del todo
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  const isEditOpen = panel?.kind === 'edit';

  // Catálogos para el formulario de edición y el informe: bajo demanda, no en cada render de la lista
  const customersQuery = useQuery({
    queryKey: ['preparte-lookup-customers'],
    queryFn: () => fetchCustomersWithRelations(),
    staleTime: LOOKUP_STALE_TIME,
    enabled: isEditOpen || reportModalOpen,
  });
  const contractsQuery = useQuery({
    queryKey: ['preparte-lookup-contracts'],
    queryFn: () => fetchAllContracts(),
    staleTime: LOOKUP_STALE_TIME,
    enabled: isEditOpen,
  });
  const customers = customersQuery.data ?? NO_CUSTOMERS;
  const contratos = contractsQuery.data ?? NO_CONTRACTS;
  const lookupsReady = customersQuery.data !== undefined && contractsQuery.data !== undefined;
  const lookupsFailed = customersQuery.isError || contractsQuery.isError;

  // PP-3: los campos de jornada, tipo, fecha, etc. viven dentro de cada ítem
  const editData = useMemo<PreparteFormData | null>(
    () => (lastEditItem && customersQuery.data ? buildEditFormData(lastEditItem, customersQuery.data) : null),
    [lastEditItem, customersQuery.data]
  );

  const { submitPreparte, confirmPreparte, removePreparte, rejectPreparte, cancelPreparte, reprogramPreparte, refresh } = usePreparteActions({
    customers,
    contratos,
  });

  const showPanel = useCallback((next: NonNullable<OrderPanel>) => {
    restoreFocusRef.current = false;
    setPanel(next);
  }, []);

  const closePanel = useCallback(() => {
    restoreFocusRef.current = true;
    setPanel(null);
  }, []);

  /** Se pasa a `onCloseAutoFocus` de cada overlay: solo al cerrar del todo el foco vuelve al botón de la tabla. */
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    if (openerRef.current?.isConnected) openerRef.current.focus();
  }, []);

  const openFromTable = useCallback(
    (next: NonNullable<OrderPanel>) => {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      showPanel(next);
    },
    [showPanel]
  );

  const handleSubmit = async (data: PreparteFormData) => {
    // El alta vive en /dashboard/operations/orders/new: acá solo se edita
    if (panel?.kind !== 'edit') return;
    const saved = await submitPreparte(data, { mode: 'edit', item: panel.item });
    if (saved) closePanel();
  };

  // Confirmación (desde la tabla o el detalle): éxito cierra el panel; sin fecha pasa a la edición; error deja el diálogo abierto
  const handlePanelConfirm = async (item: PreparteItem, confirmation: PreparteConfirmation) => {
    const result = await confirmPreparte(item, confirmation);
    if (result === 'ok') closePanel();
    else if (result === 'needs-date') showPanel({ kind: 'edit', item });
  };

  // Rechazo, cancelación o reprogramación desde el detalle (cada acción ya hace refresh y avisa por toast)
  const handleStatusChange = async (
    mode: 'reject' | 'cancel' | 'reprogram',
    item: PreparteItem,
    values: OrderStatusChangeValues
  ): Promise<boolean> => {
    const done =
      mode === 'reject'
        ? await rejectPreparte(item.id, values.reason)
        : mode === 'cancel'
          ? await cancelPreparte(item.id, values.reason)
          : await reprogramPreparte(item.id, values.date, values.reason);
    if (done) closePanel();
    return done;
  };

  const tableCallbacks = useMemo<PreparteTableCallbacks>(
    () => ({
      onView: (item) => openFromTable({ kind: 'detail', item }),
      onEdit: (item) => openFromTable({ kind: 'edit', item }),
      onDelete: async (id) => {
        await removePreparte(id);
      },
      onConfirmRequest: (item) => openFromTable({ kind: 'confirm', item, origin: 'table' }),
      onBulkStatus: (items) => {
        setSelectedRows(items);
        setIsBulkStatusModalOpen(true);
      },
    }),
    [openFromTable, removePreparte]
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm">
            Pedidos de servicio de los clientes: se confirman, se reprograman o se rechazan antes de entrar al parte
            diario.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setReportModalOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
            Generar informe
          </Button>
          <PermissionGuard module="operaciones" tab="preparte" action="create">
            <Button asChild data-testid="nuevo-pedido-button">
              <Link href="/dashboard/operations/orders/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Nuevo pedido
              </Link>
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {statusCards}

      {/* Sheet de edición: el alta es una pantalla aparte */}
      <Sheet
        open={isEditOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) closePanel();
        }}
      >
        <SheetContent
          side="right"
          className="overflow-y-auto w-[750px] max-w-[75vw] sm:max-w-[75vw]"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <SheetHeader className="mb-6">
            <SheetTitle>Editar pedido</SheetTitle>
          </SheetHeader>
          {editData && lookupsReady ? (
            <PreparteForm
              // Key para forzar remontaje al cambiar de pedido (estable durante la animación de cierre)
              key={`edit-${lastEditItem?.id}`}
              formData={editData}
              clientes={customers}
              contratos={contratos}
              isEditing
              onSubmit={(formData: PreparteFormData) => handleSubmit(formData)}
              onCancel={closePanel}
            />
          ) : lookupsFailed ? (
            <StateBlock
              variant="error"
              title="No se pudieron cargar los datos del formulario"
              description="Probá de nuevo en unos segundos."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void customersQuery.refetch();
                    void contractsQuery.refetch();
                  }}
                >
                  Reintentar
                </Button>
              }
            />
          ) : (
            <div className="space-y-4 p-4" aria-busy="true" aria-label="Cargando formulario">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Card className="w-full">
        <CardContent className="p-2">
          <_PreparteDataTable
            data={prepartes}
            totalRows={totalRows}
            searchParams={searchParams}
            prefsId={prefsId}
            namespace={namespace}
            permissionsMap={permissionsMap}
            initialColumnVisibility={initialColumnVisibility}
            initialFilterVisibility={initialFilterVisibility}
            callbacks={tableCallbacks}
            clearSelectionTrigger={clearSelectionTrigger}
          />
        </CardContent>
      </Card>

      {panel?.kind === 'detail' && (
        <OrderDetailSheet
          item={panel.item}
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) closePanel();
          }}
          canUpdate={permissionsMap['operaciones:preparte:update'] === true}
          onCloseAutoFocus={handleCloseAutoFocus}
          onAction={(action) => {
            if (action === 'confirm') showPanel({ kind: 'confirm', item: panel.item, origin: 'detail' });
            else showPanel({ kind: action, item: panel.item });
          }}
        />
      )}

      {panel?.kind === 'confirm' && (
        <OrderConfirmDialog
          item={panel.item}
          onSubmit={(confirmation) => handlePanelConfirm(panel.item, confirmation)}
          onBack={() => (panel.origin === 'detail' ? showPanel({ kind: 'detail', item: panel.item }) : closePanel())}
          backLabel={panel.origin === 'detail' ? 'Volver' : 'Cancelar'}
          onClose={closePanel}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}

      {(panel?.kind === 'reject' || panel?.kind === 'cancel' || panel?.kind === 'reprogram') && (
        <OrderStatusChangeDialog
          key={`${panel.kind}-${panel.item.id}`}
          mode={panel.kind}
          item={panel.item}
          onSubmit={(values) => handleStatusChange(panel.kind as 'reject' | 'cancel' | 'reprogram', panel.item, values)}
          onBack={() => showPanel({ kind: 'detail', item: panel.item })}
          onClose={closePanel}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}

      <PreparteBulkStatusModal
        isOpen={isBulkStatusModalOpen}
        onClose={() => setIsBulkStatusModalOpen(false)}
        selectedRows={selectedRows}
        onSuccess={() => {
          setSelectedRows([]);
          setIsBulkStatusModalOpen(false);
          setClearSelectionTrigger((value) => value + 1);
          refresh();
        }}
      />

      <PreparteReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        customers={customers}
        isLoadingCustomers={customersQuery.isLoading}
      />
    </div>
  );
}
