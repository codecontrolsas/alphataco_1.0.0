import { defineSection, tab } from '../define.ts';

export const empleadosSection = defineSection({
  key: 'empleados',
  title: 'Empleados',
  description: 'Legajos, diagramas de turnos e indumentaria.',
  icon: 'employees',
  guides: [
    {
      slug: 'empleados-listado',
      access: [tab('empleados', 'employees')],
      covers: [tab('empleados', 'empleados-activos'), tab('empleados', 'empleados-inactivos')],
      screens: [
        { path: '/dashboard/employee' },
        { path: '/dashboard/employee', tab: 'employees' },
        { path: '/dashboard/employee', tab: 'employees', subtab: 'empleados-activos' },
        { path: '/dashboard/employee', tab: 'employees', subtab: 'empleados-inactivos' },
      ],
      related: ['ficha-del-empleado', 'altas-y-bajas', 'documentos-de-empleados', 'de-candidato-a-legajo'],
    },
    {
      slug: 'ficha-del-empleado',
      access: [tab('empleados', 'detalle-empleado')],
      covers: [
        tab('empleados', 'datos-personales'),
        tab('empleados', 'datos-contacto'),
        tab('empleados', 'datos-laborales'),
        tab('empleados', 'diagramas-empleado'),
        tab('empleados', 'indumentaria_empleado'),
      ],
      screens: [{ path: '/dashboard/employee/action' }],
      related: [
        'empleados-listado',
        'altas-y-bajas',
        'documentos-alertas-y-estado',
        'documentos-de-empleados',
        'prestamos-de-herramientas',
        'diagramas',
        'entrega-de-indumentaria',
        'catalogos-de-rrhh',
      ],
    },
    {
      slug: 'diagramas',
      access: [tab('empleados', 'diagrams')],
      covers: [
        tab('empleados', 'old'),
        tab('empleados', 'new'),
        tab('empleados', 'massive_diagram'),
        tab('empleados', 'reports'),
      ],
      screens: [
        { path: '/dashboard/employee', tab: 'diagrams' },
        { path: '/dashboard/employee', tab: 'diagrams', subtab: 'old' },
        { path: '/dashboard/employee', tab: 'diagrams', subtab: 'new' },
        { path: '/dashboard/employee', tab: 'diagrams', subtab: 'massive_diagram' },
        { path: '/dashboard/employee', tab: 'diagrams', subtab: 'reports' },
      ],
      related: ['diagramas-afectaciones-y-desvios', 'catalogos-de-rrhh', 'partes-diarios', 'dashboard-estadisticas'],
    },
  ],
});
