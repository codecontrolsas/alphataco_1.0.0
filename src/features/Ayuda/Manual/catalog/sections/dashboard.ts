import { defineSection, tab } from '../define.ts';

export const dashboardSection = defineSection({
  key: 'dashboard',
  title: 'Dashboard',
  description: 'Tableros personalizables con indicadores del día, vencimientos y estadísticas.',
  icon: 'dashboard',
  guides: [
    {
      // Guía general del Dashboard: tableros, personalización y qué widgets ve cada uno.
      slug: 'dashboard-tableros',
      access: [tab('dashboard', 'principal'), tab('dashboard', 'documentacion'), tab('dashboard', 'estadisticas')],
      covers: [],
      screens: [{ path: '/dashboard' }],
      related: ['dashboard-principal', 'dashboard-vencimientos', 'dashboard-estadisticas', 'kpis', 'usuarios-y-roles'],
    },
    {
      slug: 'dashboard-principal',
      access: [tab('dashboard', 'principal')],
      covers: [],
      screens: [{ path: '/dashboard', tab: 'principal' }],
      related: [
        'dashboard-tableros',
        'partes-diarios',
        'diagramas',
        'dashboard-vencimientos',
        'diagramas-afectaciones-y-desvios',
      ],
    },
    {
      slug: 'dashboard-vencimientos',
      access: [tab('dashboard', 'documentacion')],
      covers: [tab('dashboard', 'empleados'), tab('dashboard', 'vehiculos')],
      screens: [
        { path: '/dashboard', tab: 'documentacion' },
        { path: '/dashboard', tab: 'documentacion', subtab: 'empleados' },
        { path: '/dashboard', tab: 'documentacion', subtab: 'vehiculos' },
      ],
      related: [
        'documentos-alertas-y-estado',
        'documentos-de-empleados',
        'documentos-de-equipos',
        'detalle-de-documento',
      ],
    },
    {
      slug: 'dashboard-estadisticas',
      access: [tab('dashboard', 'estadisticas')],
      covers: [
        tab('dashboard', 'operaciones'),
        tab('dashboard', 'rrhh'),
        tab('dashboard', 'mantenimiento'),
        tab('dashboard', 'desvios'),
      ],
      screens: [
        { path: '/dashboard', tab: 'estadisticas' },
        { path: '/dashboard', tab: 'estadisticas', subtab: 'operaciones' },
        { path: '/dashboard', tab: 'estadisticas', subtab: 'rrhh' },
        { path: '/dashboard', tab: 'estadisticas', subtab: 'mantenimiento' },
        { path: '/dashboard', tab: 'estadisticas', subtab: 'desvios' },
      ],
      related: ['kpis', 'partes-diarios', 'diagramas', 'diagramas-afectaciones-y-desvios'],
    },
  ],
});
