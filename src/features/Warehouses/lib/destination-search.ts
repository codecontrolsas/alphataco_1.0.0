import { containsInsensitive as contains } from '@/shared/lib/table-list-query';

/**
 * Condiciones OR para buscar un destino por texto: legajo o nombre del empleado, dominio o interno del
 * equipo, interno de otro equipo, número de la orden de mantenimiento o nombre del cliente. La usan las
 * listas cuyas filas tienen esas relaciones (pedidos, solicitudes de compra, movimientos, préstamos).
 */
export function destinationSearchConditions(text: string) {
  return [
    { employee: { OR: [{ file: contains(text) }, { lastname: contains(text) }, { firstname: contains(text) }] } },
    { vehicle: { OR: [{ domain: contains(text) }, { intern_number: contains(text) }] } },
    { other_equipment: { intern_number: contains(text) } },
    { maintenance_order: { order_number: contains(text) } },
    { customer: { name: contains(text) } },
  ];
}
