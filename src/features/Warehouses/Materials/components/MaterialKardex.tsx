import { SectionCard } from '@/shared/components/common/SectionCard';
import { getMaterialKardexPage } from '../../actions/materials-detail.server';
import { MaterialKardexTable } from './MaterialKardexTable';

/**
 * Kardex del material. Es una tabla fija y no un DataTable a proposito: el saldo y el promedio
 * acumulados solo tienen sentido en orden de registro; ordenar o filtrar las filas los volveria
 * numeros sueltos. Para buscar movimientos con filtros esta la tabla de Movimientos.
 */
export async function MaterialKardex({ materialId, unit }: { materialId: string; unit: string }) {
  const { rows, total, hasMore } = await getMaterialKardexPage(materialId);
  const showPrices = rows.some((r) => r.unitCost !== null);

  return (
    <SectionCard
      title="Kardex"
      description={`Los movimientos del material en el orden en que se registraron, con el saldo de la empresa${
        showPrices ? ' y el costo promedio' : ''
      } después de cada uno.`}
    >
      {total === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">El material todavía no tiene movimientos.</p>
      ) : (
        <MaterialKardexTable materialId={materialId} unit={unit} initialRows={rows} total={total} initialHasMore={hasMore} />
      )}
    </SectionCard>
  );
}
