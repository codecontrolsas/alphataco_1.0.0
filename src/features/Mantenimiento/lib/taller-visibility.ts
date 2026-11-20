/**
 * Pestañas de Mantenimiento cuyo `view` habilita la vista Taller de Gestión: una por cada paso que Taller muestra.
 *
 * NO incluye `maint_taller` ni `bandeja_aprobaciones`. `maint_taller` es la tab padre y se vuelve visible por
 * inferencia con el `view` de CUALQUIERA de sus subtabs; entre ellas `bandeja_aprobaciones`, que desde el 778 vive en
 * Mi bandeja y no es un paso de Taller. Si Gestión/Taller se habilitaran con el padre, quien solo tiene la bandeja
 * entraría a una vista vacía («Sin acceso»). Módulo sin directiva: lo usan el sidebar y los componentes de servidor.
 */
export const TALLER_VIEW_TABS = [
  'pedidos_pendientes',
  'pedidos_confirmados',
  'ordenes_mantenimiento',
  'ordenes_gomeria',
] as const;
