import { defineSection, tab } from '../define.ts';

/**
 * Módulo HSE (`/dashboard/hse`). Cada sección del menú es un `?tab=`; los detalles de documento,
 * capacitación y acta tienen el id en la URL y se declaran con el comodín `/*`. Los tipos de
 * documento HSE viven en Configuración → Tipos de documento → HSE.
 */
export const hseSection = defineSection({
  key: 'hse',
  title: 'HSE',
  description: 'Documentos que el personal lee y acepta, capacitaciones con examen, cumplimiento y actas de dictado.',
  icon: 'hse',
  guides: [
    {
      slug: 'hse',
      // Guía de entrada al módulo: la ve quien tenga Ver en cualquiera de sus secciones.
      access: [
        tab('hse', 'documentos-hse'),
        tab('hse', 'capacitaciones'),
        tab('hse', 'cumplimiento'),
        tab('hse', 'actas'),
        tab('hse', 'configuracion-hse'),
      ],
      screens: [{ path: '/dashboard/hse' }],
      related: [
        'documentos-hse',
        'capacitaciones-hse',
        'cumplimiento-hse',
        'actas-y-constancias',
        'tipos-de-documento-hse',
      ],
    },
    {
      slug: 'documentos-hse',
      access: [tab('hse', 'documentos-hse')],
      screens: [
        { path: '/dashboard/hse', tab: 'documentos-hse' },
        { path: '/dashboard/hse/documents/*' },
      ],
      related: ['cumplimiento-hse', 'tipos-de-documento-hse', 'hse', 'ficha-del-empleado'],
    },
    {
      slug: 'capacitaciones-hse',
      access: [tab('hse', 'capacitaciones')],
      screens: [
        { path: '/dashboard/hse', tab: 'capacitaciones' },
        { path: '/dashboard/hse/trainings/*' },
      ],
      related: ['actas-y-constancias', 'hse', 'documentos-hse', 'ficha-del-empleado'],
    },
    {
      slug: 'cumplimiento-hse',
      access: [tab('hse', 'cumplimiento')],
      screens: [{ path: '/dashboard/hse', tab: 'cumplimiento' }],
      related: ['documentos-hse', 'capacitaciones-hse', 'hse'],
    },
    {
      slug: 'actas-y-constancias',
      access: [tab('hse', 'actas')],
      screens: [
        { path: '/dashboard/hse', tab: 'actas' },
        { path: '/dashboard/hse/records/*' },
      ],
      related: ['capacitaciones-hse', 'hse', 'documentos-de-empleados'],
    },
    {
      slug: 'tipos-de-documento-hse',
      access: [tab('hse', 'configuracion-hse')],
      screens: [{ path: '/dashboard/configuration', tab: 'documentos', subtab: 'HSE' }],
      related: ['documentos-hse', 'tipos-de-documento', 'hse'],
    },
  ],
});
