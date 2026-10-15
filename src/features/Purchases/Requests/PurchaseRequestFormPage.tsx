import { Card, CardContent } from '@/components/ui/card';
import { getMovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { PurchasesPageShell } from '../components/PurchasesPageShell';
import { getMaterialRequestShortfall } from '../actions/requests.server';
import { getPurchaseRequestFormLookups } from '../actions/request-queries.server';
import type { PurchaseRequestDetail } from '../lib/request-query-types';
import { emptyPurchaseRequestLine, type PurchaseRequestFormValues } from '../schemas/requests';
import { PurchaseRequestForm, type LineLabels, type PurchaseRequestFormMode } from './components/PurchaseRequestForm';

const EMPTY_DESTINATION = {
  destinationType: '' as const,
  employeeId: '',
  vehicleId: '',
  otherEquipmentId: '',
  maintenanceOrderId: '',
  customerId: '',
  customerServiceId: '',
};

const BACK_TO_LIST = { href: '/dashboard/purchases?tab=solicitudes', label: 'Solicitudes' };

/** Alta de una solicitud, en blanco o a partir de un pedido de Almacenes (`?fromMaterialRequest=`). */
export async function NewPurchaseRequestPage({ fromMaterialRequest }: { fromMaterialRequest?: string }) {
  const [{ customers }, { units }] = await Promise.all([getMovementFormLookups(), getPurchaseRequestFormLookups()]);

  if (!fromMaterialRequest) {
    const defaultValues: PurchaseRequestFormValues = { ...EMPTY_DESTINATION, neededBy: '', notes: '', lines: [emptyPurchaseRequestLine()] };
    return (
      <PurchasesPageShell title="Nueva solicitud de compra" back={BACK_TO_LIST}>
        <PurchaseRequestForm mode={{ kind: 'create' }} defaultValues={defaultValues} initialLabels={{}} customers={customers} units={units} />
      </PurchasesPageShell>
    );
  }

  const shortfall = await getMaterialRequestShortfall(fromMaterialRequest);
  const back = { href: `/dashboard/warehouse/requests/${fromMaterialRequest}`, label: 'Volver al pedido' };
  if (!shortfall.ok) {
    return (
      <PurchasesPageShell title="Nueva solicitud de compra" back={back}>
        <Card>
          <CardContent className="pt-6 text-sm">{shortfall.error}</CardContent>
        </Card>
      </PurchasesPageShell>
    );
  }

  const { data } = shortfall;
  const defaultValues: PurchaseRequestFormValues = {
    ...EMPTY_DESTINATION,
    neededBy: '',
    notes: `Faltante del pedido ${data.number}`,
    lines: data.lines.map((l) => ({ ...emptyPurchaseRequestLine(), materialId: l.materialId, quantity: l.shortfall })),
  };
  const initialLabels: LineLabels = Object.fromEntries(
    data.lines.map((l, i) => [i, { material: `${l.code} · ${l.name}`, unit: l.unit }])
  );
  const mode: PurchaseRequestFormMode = {
    kind: 'fromMaterialRequest',
    materialRequest: { id: data.id, number: data.number, destination: data.destinationLabel },
  };
  return (
    <PurchasesPageShell title={`Solicitud de compra para el pedido ${data.number}`} back={back}>
      <PurchaseRequestForm mode={mode} defaultValues={defaultValues} initialLabels={initialLabels} customers={customers} units={units} />
    </PurchasesPageShell>
  );
}

/** Edicion de un borrador. */
export async function EditPurchaseRequestPage({ request }: { request: PurchaseRequestDetail }) {
  const [{ customers }, { units }] = await Promise.all([getMovementFormLookups(), getPurchaseRequestFormLookups()]);
  const defaultValues: PurchaseRequestFormValues = {
    ...request.form,
    neededBy: request.neededBy ?? '',
    notes: request.notes ?? '',
    lines: request.lines.map((l) => ({
      kind: l.materialId ? ('MATERIAL' as const) : ('FREE_TEXT' as const),
      materialId: l.materialId ?? '',
      description: l.description ?? '',
      quantity: l.quantity,
      unitId: l.materialId ? '' : l.unitId,
      suggestedSupplierId: l.suggestedSupplier?.id ?? '',
      notes: l.notes ?? '',
    })),
  };
  const initialLabels: LineLabels = Object.fromEntries(
    request.lines.map((l, i) => [
      i,
      {
        material: l.material ? `${l.material.code} · ${l.material.name}` : undefined,
        unit: l.unit,
        supplier: l.suggestedSupplier?.name,
      },
    ])
  );
  const mode: PurchaseRequestFormMode = {
    kind: 'edit',
    requestId: request.id,
    number: request.number,
    materialRequest: request.materialRequest
      ? { id: request.materialRequest.id, number: request.materialRequest.number, destination: request.destination }
      : null,
  };
  return (
    <PurchasesPageShell title={`Editar ${request.number}`} back={{ href: `/dashboard/purchases/requests/${request.id}`, label: request.number }}>
      <PurchaseRequestForm mode={mode} defaultValues={defaultValues} initialLabels={initialLabels} customers={customers} units={units} />
    </PurchasesPageShell>
  );
}
