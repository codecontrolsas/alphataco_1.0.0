import { defineSection, tab } from '../define.ts';

export const mantenimientoSection = defineSection({
  key: 'mantenimiento',
  title: 'Mantenimiento',
  description: 'Solicitudes, taller, Mi bandeja, órdenes de trabajo y gomería.',
  icon: 'maintenance',
  guides: [
    {
      slug: 'validar-solicitudes',
      access: [tab('mantenimiento', 'maint_operaciones')],
      covers: [tab('mantenimiento', 'maintenance_requests'), tab('mantenimiento', 'seguimiento_taller')],
      // Los pasos del circuito (`?op_step=validate|in_workshop`) no se pueden declarar: el catálogo
      // sólo distingue `tab`/`subtab`. Toda la pestaña Operaciones abre esta guía.
      screens: [{ path: '/dashboard/maintenance' }, { path: '/dashboard/maintenance', tab: 'maint_operaciones' }],
      related: ['del-checklist-al-taller', 'taller', 'nuevo-pedido-de-mantenimiento', 'equipos-con-desvios'],
    },
    {
      slug: 'taller',
      access: [tab('mantenimiento', 'maint_taller')],
      covers: [
        tab('mantenimiento', 'maintenance_orders'),
        tab('mantenimiento', 'gestion_ordenes'),
        tab('mantenimiento', 'bandeja_aprobaciones'),
        tab('mantenimiento', 'ordenes_mantenimiento'),
      ],
      // Pasos `?taller_step=schedule|confirmed|in_workshop|gomeria`: misma limitación que arriba. `approvals` ya no
      // existe: redirige a Mi bandeja.
      screens: [{ path: '/dashboard/maintenance', tab: 'maint_taller' }],
      related: [
        'mi-bandeja',
        'gomeria',
        'del-checklist-al-taller',
        'validar-solicitudes',
        'vista-taller',
        'panel-del-operario',
        'catalogos-de-mantenimiento',
        'pedidos-de-materiales',
      ],
    },
    {
      slug: 'mi-bandeja',
      // Sin tab propia: se ve con el permiso de la bandeja de aprobaciones o con el de las órdenes (Validar cierre).
      access: [tab('mantenimiento', 'bandeja_aprobaciones'), tab('mantenimiento', 'ordenes_mantenimiento')],
      screens: [{ path: '/dashboard/inbox' }],
      related: ['taller', 'panel-del-operario', 'validar-solicitudes', 'vista-taller'],
    },
    {
      slug: 'vista-taller',
      // Sección «Sectores» (ex Vista taller): tablero + administración de sectores, que vino de Configuración (778).
      access: [tab('mantenimiento', 'workshop_view'), tab('configuracion', 'sectores_taller')],
      screens: [{ path: '/dashboard/maintenance', tab: 'workshop_view' }],
      related: ['taller', 'panel-del-operario', 'catalogos-de-mantenimiento'],
    },
    {
      slug: 'nuevo-pedido-de-mantenimiento',
      access: [tab('mantenimiento', 'nuevo_pedido')],
      screens: [{ path: '/dashboard/maintenance', tab: 'nuevo_pedido' }],
      related: ['del-checklist-al-taller', 'validar-solicitudes', 'taller', 'qr-del-equipo'],
    },
    {
      slug: 'equipos-con-desvios',
      access: [tab('mantenimiento', 'equipments_with_deviations')],
      screens: [{ path: '/dashboard/maintenance', tab: 'equipments_with_deviations' }],
      related: ['del-checklist-al-taller', 'validar-solicitudes', 'qr-del-equipo', 'ficha-del-vehiculo'],
    },
    {
      slug: 'gomeria',
      access: [tab('mantenimiento', 'gomeria')],
      covers: [
        tab('mantenimiento', 'catalogo_cubiertas'),
        tab('mantenimiento', 'plantillas_cubiertas'),
        tab('mantenimiento', 'ordenes_gomeria'),
        tab('mantenimiento', 'marcas_cubiertas'),
        tab('mantenimiento', 'tipos_cubiertas'),
      ],
      // Gomería se repartió por función (778): el catálogo vive en Almacenes > Cubiertas y plantillas, marcas y tipos en
      // Configuración > Taller > Cubiertas. Las órdenes están en Gestión > Taller (paso `?taller_step=gomeria`), que el
      // catálogo no puede declarar: abre la guía de Taller. La pantalla vieja (`tab=gomeria`) queda por los enlaces guardados.
      screens: [
        { path: '/dashboard/warehouse', tab: 'cubiertas' },
        { path: '/dashboard/configuration', tab: 'mantenimiento', subtab: 'cubiertas' },
        { path: '/dashboard/maintenance', tab: 'gomeria' },
      ],
      related: [
        'ficha-del-vehiculo',
        'qr-del-equipo',
        'catalogos-de-equipos',
        'materiales',
        'configuracion-de-almacenes',
      ],
    },
  ],
});
