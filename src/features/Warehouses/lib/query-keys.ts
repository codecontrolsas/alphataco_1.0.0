/**
 * Claves de React Query de las tablas de Almacenes. Las tablas las usan como `queryKey` y los
 * formularios las invalidan despues de mutar (las tablas corren en client-side mode: un
 * `router.refresh()` solo no las actualiza).
 */
export const WAREHOUSE_QUERY_KEYS = {
  stock: ['warehouse-stock'],
  movements: ['warehouse-movements'],
  materials: ['warehouse-materials'],
  depots: ['warehouse-depots'],
  loans: ['warehouse-loans'],
  requests: ['warehouse-requests'],
  /** Disponible de un material en un deposito (lineas del formulario de movimientos). */
  availability: ['warehouse-availability'],
  /** Categorias y unidades (Configuracion). */
  settings: ['warehouse-settings'],
  /** Depositos a los que se puede devolver un prestamo. */
  returnWarehouses: ['warehouse-return-warehouses'],
  /** Busqueda de materiales del formulario de movimientos. */
  materialOptions: ['warehouse-material-options'],
} as const;
