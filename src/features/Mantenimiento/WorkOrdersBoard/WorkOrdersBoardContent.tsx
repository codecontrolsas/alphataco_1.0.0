import { StateBlock } from '@/shared/components/common/StateBlock';
import { getBoardColumns } from './actions/board.server';
import { WorkOrdersBoardView } from './components/WorkOrdersBoardView';

/**
 * Tablero de órdenes de Taller (vista alternativa a las pestañas). Server Component: trae las columnas que el usuario
 * puede ver y las hidrata en el cliente, que las refresca con React Query.
 */
export async function WorkOrdersBoardContent() {
  const initialData = await getBoardColumns();

  if (initialData.columns.length === 0) {
    return <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para ver ninguna columna del tablero." />;
  }

  return <WorkOrdersBoardView initialData={initialData} />;
}
