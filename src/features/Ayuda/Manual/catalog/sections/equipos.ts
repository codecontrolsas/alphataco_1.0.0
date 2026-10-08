import { defineSection, tab } from '../define.ts';

export const equiposSection = defineSection({
  key: 'equipos',
  title: 'Equipos',
  description: 'Vehículos, equipamiento, bajas y su documentación.',
  icon: 'equipment',
  guides: [
    {
      slug: 'equipos-listado',
      access: [tab('equipos', 'equipos')],
      covers: [tab('equipos', 'vehicles'), tab('equipos', 'others')],
      screens: [
        { path: '/dashboard/equipment' },
        { path: '/dashboard/equipment', tab: 'equipos' },
        { path: '/dashboard/equipment', tab: 'equipos', subtab: 'vehicles' },
        { path: '/dashboard/equipment', tab: 'equipos', subtab: 'others' },
      ],
      related: ['ficha-del-vehiculo', 'ficha-de-otro-equipo', 'equipos-dados-de-baja', 'documentos-de-equipos'],
    },
    {
      slug: 'equipos-dados-de-baja',
      access: [tab('equipos', 'equipos')],
      covers: [tab('equipos', 'inactive')],
      screens: [{ path: '/dashboard/equipment', tab: 'equipos', subtab: 'inactive' }],
      related: ['equipos-listado', 'ficha-del-vehiculo', 'altas-y-bajas', 'documentos-alertas-y-estado'],
    },
    {
      slug: 'ficha-del-vehiculo',
      access: [tab('equipos', 'detalle-equipo')],
      covers: [
        tab('equipos', 'datos-basicos'),
        tab('equipos', 'asignacion'),
        tab('equipos', 'qr-equipo'),
        tab('equipos', 'historial-mantenimiento-equipo'),
        tab('equipos', 'checklist-equipo'),
        tab('equipos', 'cubiertas-equipo'),
      ],
      // Vehículos y equipamiento comparten esta ruta (el equipamiento sólo agrega `type=other`,
      // que el catálogo no distingue): el botón "?" de la ficha abre esta guía en ambos casos.
      screens: [{ path: '/dashboard/equipment/action' }],
      related: ['equipos-listado', 'documentos-de-equipos', 'qr-del-equipo', 'del-checklist-al-taller', 'gomeria', 'movimientos-de-stock'],
    },
    {
      slug: 'ficha-de-otro-equipo',
      access: [tab('equipos', 'detalle-otro-equipo')],
      covers: [
        tab('equipos', 'datos-basicos-otro'),
        tab('equipos', 'asignacion-otro'),
        tab('equipos', 'certificaciones-otro'),
        tab('equipos', 'qr-otro-equipo'),
      ],
      related: ['equipos-listado', 'ficha-del-vehiculo', 'equipos-dados-de-baja', 'qr-del-equipo'],
    },
  ],
});
