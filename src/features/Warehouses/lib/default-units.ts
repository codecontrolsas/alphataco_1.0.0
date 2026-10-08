/**
 * Unidades de medida con las que arranca toda empresa. Cada empresa puede agregar las suyas
 * desde Almacenes → Configuración.
 *
 * Fuente unica para `scripts/seed-company.ts`, la demo y la migracion
 * `20261004110000_warehouses_module_permissions` (que las copia literal: una migracion no
 * importa codigo). Si se cambia la lista, las empresas existentes NO se actualizan solas.
 */
export const DEFAULT_MEASUREMENT_UNITS = [
  { name: 'Unidad', abbreviation: 'u' },
  { name: 'Litro', abbreviation: 'l' },
  { name: 'Kilogramo', abbreviation: 'kg' },
  { name: 'Metro', abbreviation: 'm' },
  { name: 'Par', abbreviation: 'par' },
  { name: 'Caja', abbreviation: 'caja' },
] as const;
