/**
 * Entidades del módulo de pedidos inferidas del retorno de las server actions
 * (nunca tipos manuales que se desincronicen). Módulo sin directiva: lo importan
 * tanto el cliente como el servidor, y solo con `import type`.
 */
import type { fetchAllContracts } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import type { fetchCustomersWithRelations } from '../actions/form-data.server';
import type { PreparteListItem } from '../list/actions.server';

/** Cliente con sus contratos, sectores, áreas e ítems (formulario de pedido). */
export type Cliente = Awaited<ReturnType<typeof fetchCustomersWithRelations>>[number];
/** Contrato (servicio) listado para el formulario de edición. */
export type Contrato = Awaited<ReturnType<typeof fetchAllContracts>>[number];
/** Fila de la lista de pedidos. */
export type PreparteItem = PreparteListItem;
