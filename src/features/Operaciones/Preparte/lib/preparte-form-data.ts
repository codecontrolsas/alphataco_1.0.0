import type { Preparte } from '@/features/Operaciones/Preparte/types';
import type { PreparteListItem } from '@/features/Operaciones/Preparte/list/actions.server';
import moment from 'moment';
import type { Cliente } from '../types/entities';
import type { PreparteFormData } from '../schemas/preparte-form';
import { resolveServiceAreaId, resolveServiceSectorId } from './service-relation-id';

/**
 * Estado vacío del formulario de pedido.
 * Los campos por ítem (jornada, tipo, fecha, etc.) viven dentro de cada ítem.
 * Es una función porque `requestDate` debe ser la fecha del momento de uso.
 */
export function createEmptyPreparteFormData(): PreparteFormData {
  return {
    id: '',
    cliente_id: '',
    contrato_id: '',
    item: [],
    requestDate: new Date(),
    solicitante: '',
    status: 'pendiente',
    sector_service_id: '',
    areas_service_id: '',
    equipos_cliente: [],
  };
}

/**
 * Parsea fechas de BD (timestamptz guardadas como UTC midnight)
 * a un Date de medianoche local para el componente Calendar.
 */
export function parseDBDateForCalendar(dateStr: string): Date {
  const d = moment.utc(dateStr);
  return new Date(d.year(), d.month(), d.date());
}

/** Todas las fechas (día a día) entre dos fechas, ambas inclusive. */
export function getDatesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Arma los datos del formulario de edición a partir de un pedido existente.
 * En registros existentes la fecha está a nivel de pedido: se mueve al ítem.
 */
export function buildEditFormData(item: PreparteListItem, customers: Cliente[]): PreparteFormData {
  const existingSubjectToAvailability = item.subject_to_availability ?? false;

  // executionDate: string ISO (de BD) o null
  let existingExecutionDate: { from?: Date; to?: Date } | undefined = undefined;

  if (!existingSubjectToAvailability && item.executionDate) {
    existingExecutionDate = {
      from: parseDBDateForCalendar(item.executionDate),
      to: undefined,
    };
  }
  // Si subject_to_availability es true, la fecha queda undefined

  const itemArray =
    typeof item.item === 'string'
      ? [
          {
            id: item.item,
            quantity: item.quantity || 1,
            jornada: item.jornada || '',
            tipo: item.tipo || '',
            observaciones: item.observaciones || '',
            start_time: item.start_time || '',
            end_time: item.end_time || '',
            executionDate: existingExecutionDate,
            subject_to_availability: existingSubjectToAvailability,
          },
        ]
      : [];

  const cliente = customers.find((c) => c.id === item.cliente_id);

  // El valor guardado puede ser el id de la pivote o el de la entidad de origen.
  // La traducción es compartida: `lib/service-relation-id`.
  const sectorForForm =
    resolveServiceSectorId(item.sector_service_id, cliente?.customer_services, item.contrato_id) ??
    item.sector_service_id ??
    '';

  const areaForForm =
    resolveServiceAreaId(item.areas_service_id, cliente?.customer_services, item.contrato_id) ??
    item.areas_service_id ??
    '';

  // Equipos: array para el multiselect
  const equiposForForm = item.equipos_cliente ? [item.equipos_cliente] : [];

  return {
    id: item.id,
    cliente_id: item.cliente_id,
    contrato_id: item.contrato_id || '',
    item: itemArray,
    requestDate: item.requestDate ? parseDBDateForCalendar(item.requestDate) : new Date(),
    solicitante: item.solicitante || '',
    status: item.status || 'pendiente',
    quantity: item.quantity || 1,
    numero_pedido: item.numero_pedido || '',
    sector_service_id: sectorForForm,
    areas_service_id: areaForForm,
    equipos_cliente: equiposForForm,
    image_url: item.preparteImage || '',
    original_item_id: typeof item.item === 'string' ? item.item : undefined,
  };
}

export interface PreparteReasonInfo {
  title: string;
  content: string;
  actorLabel: string | null;
  actor: string | null;
}

/**
 * Motivo del estado actual del pedido (cancelación, rechazo, reprogramación)
 * o aviso de vencimiento. Devuelve `null` si el estado no tiene motivo.
 * Si el motivo no fue cargado, se informa "Sin motivo registrado".
 */
export function getPreparteReasonInfo(item: PreparteListItem): PreparteReasonInfo | null {
  const fallback = 'Sin motivo registrado';

  switch (item.status) {
    case 'cancelado':
      return {
        title: 'Motivo de cancelación',
        content: item.cancel_reason?.trim() || fallback,
        actorLabel: 'Cancelado por',
        actor: item.cancelled_by_profile?.fullname?.trim() || null,
      };
    case 'rechazado':
      return {
        title: 'Motivo de rechazo',
        content: item.rejected_reason?.trim() || fallback,
        actorLabel: 'Rechazado por',
        actor: item.rejected_by_profile?.fullname?.trim() || null,
      };
    case 'reprogramado':
      return {
        title: 'Motivo de reprogramación',
        content: item.reprogram_reason?.trim() || fallback,
        actorLabel: 'Reprogramado por',
        actor: item.reprogrammed_by_profile?.fullname?.trim() || null,
      };
    case 'vencido':
      return {
        title: 'Vencimiento',
        content: 'Este preparte ha vencido sin ser confirmado a tiempo.',
        actorLabel: null,
        actor: null,
      };
    default:
      return null;
  }
}

/** Campos de un ítem que intervienen en la expansión a pedidos. */
export type OrderCountItem = Pick<
  PreparteFormData['item'][number],
  'id' | 'quantity' | 'subject_to_availability' | 'executionDate'
>;

/** Un pedido a crear: el ítem de origen y su fecha (`null` si está sujeto a disponibilidad). */
interface OrderSlot<T extends OrderCountItem> {
  item: T;
  /** `YYYY-MM-DD`, o `null` cuando el ítem está sujeto a disponibilidad. */
  executionDate: string | null;
}

const MISSING_DATE_ERROR = 'El ítem debe tener fecha de ejecución o estar sujeto a disponibilidad';
const NO_VALID_ITEMS_ERROR = 'Debe agregar al menos un ítem válido';

/**
 * Expande los ítems en los pedidos que se crean: se ignoran los ítems sin `id`; uno sujeto a
 * disponibilidad genera `quantity` pedidos sin fecha; uno con fecha genera `quantity` × cada día
 * del rango (ambos extremos inclusive). Un ítem con fecha pero sin `from` no genera ninguno y
 * deja `error` (el alta lo rechaza). Es la única fuente de verdad del alta y del conteo del resumen.
 */
function expandOrderSlots<T extends OrderCountItem>(
  items: readonly T[]
): { slots: OrderSlot<T>[]; error: string | null } {
  const slots: OrderSlot<T>[] = [];
  let error: string | null = null;

  for (const item of items) {
    if (!item.id) continue;

    const quantity = item.quantity || 1;

    if (item.subject_to_availability ?? false) {
      for (let i = 0; i < quantity; i++) slots.push({ item, executionDate: null });
      continue;
    }

    const execution = item.executionDate;
    if (!execution?.from) {
      error ??= MISSING_DATE_ERROR;
      continue;
    }

    const dates = execution.to
      ? getDatesInRange(new Date(execution.from), new Date(execution.to))
      : [new Date(execution.from)];

    for (let i = 0; i < quantity; i++) {
      for (const date of dates) slots.push({ item, executionDate: moment(date).format('YYYY-MM-DD') });
    }
  }

  return { slots, error };
}

/** Pedido listo para crear, sin lo que se resuelve recién al guardar (N° de pedido e imagen movida). */
export type ExpandedOrder = Omit<Preparte, 'id' | 'numero_pedido' | 'preparteImage'>;

/**
 * Pedidos que crea `submitPreparte` (modo alta) para el formulario. Devuelve `{ error }` si algún
 * ítem no tiene fecha ni está sujeto a disponibilidad, o si no queda ningún ítem válido. Se valida
 * y expande ANTES de generar el N° de pedido o mover la imagen, para no dejar nada a medias.
 */
export function expandPreparteItems(formData: PreparteFormData): ExpandedOrder[] | { error: string } {
  const { slots, error } = expandOrderSlots(formData.item);
  if (error) return { error };
  if (slots.length === 0) return { error: NO_VALID_ITEMS_ERROR };

  const requestDate = moment(formData.requestDate).format('YYYY-MM-DD');

  return slots.map(({ item, executionDate }) => ({
    cliente_id: formData.cliente_id,
    contrato_id: formData.contrato_id,
    tipo: item.tipo || '',
    jornada: item.jornada || '',
    start_time: item.start_time || null,
    end_time: item.end_time || null,
    // Los ítems con fecha guardan `null`; los sujetos a disponibilidad, texto vacío (como antes)
    observaciones: executionDate === null ? item.observaciones || '' : item.observaciones || null,
    solicitante: formData.solicitante,
    status: 'pendiente',
    item: item.id,
    quantity: 1,
    executionDate,
    requestDate,
    sector_service_id: formData.sector_service_id || null,
    areas_service_id: formData.areas_service_id || null,
    equipos_cliente: formData.equipos_cliente?.[0] || null,
    subject_to_availability: executionDate === null,
  }));
}

/**
 * Cantidad de pedidos que `submitPreparte` crea para los ítems indicados. Usa la misma expansión
 * que el alta, así el resumen y lo que se guarda no pueden divergir. Es tolerante: un ítem que el
 * alta rechazaría (con fecha pero sin `from`) simplemente no suma.
 */
export function countOrdersToCreate(items: readonly OrderCountItem[]): number {
  return expandOrderSlots(items).slots.length;
}

/** Un requisito del formulario de nuevo pedido y si ya está cubierto. */
export interface OrderChecklistEntry {
  key: 'customer-contract' | 'area' | 'requester' | 'request-date' | 'items';
  label: string;
  done: boolean;
}

/** Valores del formulario que alcanzan para armar el checklist (todos opcionales: se observan en vivo). */
export interface OrderChecklistValues {
  cliente_id?: string;
  contrato_id?: string;
  areas_service_id?: string;
  solicitante?: string;
  requestDate?: Date;
  item?: readonly (Partial<PreparteFormData['item'][number]> | undefined)[];
}

/**
 * Checklist de obligatorios del alta de pedido, calculado a mano a partir de los valores
 * observados (el schema tiene `.refine`, así que no expone `shape` para derivarlo).
 * Debe reflejar lo que exige `formSchema`.
 */
export function getOrderChecklist(values: OrderChecklistValues): OrderChecklistEntry[] {
  const items = (values.item ?? []).filter((row): row is NonNullable<typeof row> => Boolean(row?.id));
  const itemsValid =
    items.length > 0 &&
    items.every(
      (row) =>
        (row.quantity ?? 0) >= 1 &&
        Boolean(row.jornada) &&
        Boolean(row.tipo) &&
        (Boolean(row.subject_to_availability) || row.executionDate?.from !== undefined)
    );

  return [
    { key: 'customer-contract', label: 'Cliente y contrato', done: Boolean(values.cliente_id && values.contrato_id) },
    { key: 'area', label: 'Área del cliente', done: Boolean(values.areas_service_id) },
    { key: 'requester', label: 'Solicitante', done: Boolean(values.solicitante?.trim()) },
    { key: 'request-date', label: 'Fecha de solicitud', done: values.requestDate instanceof Date },
    { key: 'items', label: 'Ítems, jornada y fechas', done: itemsValid },
  ];
}
