import { defineSection, tab } from '../define.ts';

/**
 * Módulo Tesorería (`/dashboard/treasury`). Cada sección del menú es un `?tab=`; el extracto de
 * una cuenta tiene el id en la URL y se declara con el comodín `/*`.
 */
export const tesoreriaSection = defineSection({
  key: 'tesoreria',
  title: 'Tesorería',
  description: 'Saldos de cuentas bancarias y cajas, extracto, movimientos manuales, transferencias entre cuentas y el reflejo de los pagos a proveedores.',
  icon: 'treasury',
  guides: [
    {
      slug: 'tesoreria',
      // Guía de entrada al módulo: la ve quien tenga Ver en cualquiera de sus secciones.
      access: [
        tab('tesoreria', 'cuentas'),
        tab('tesoreria', 'movimientos'),
        tab('tesoreria', 'transferencias'),
        tab('tesoreria', 'config-tesoreria'),
      ],
      screens: [{ path: '/dashboard/treasury' }],
      related: ['cuentas-y-saldos', 'movimientos-de-tesoreria', 'transferencias', 'configuracion-de-tesoreria', 'ordenes-de-pago'],
    },
    {
      slug: 'cuentas-y-saldos',
      access: [tab('tesoreria', 'cuentas')],
      screens: [
        { path: '/dashboard/treasury', tab: 'cuentas' },
        { path: '/dashboard/treasury/accounts/*' },
      ],
      related: ['tesoreria', 'movimientos-de-tesoreria', 'transferencias', 'ordenes-de-pago'],
    },
    {
      slug: 'movimientos-de-tesoreria',
      access: [tab('tesoreria', 'movimientos')],
      screens: [{ path: '/dashboard/treasury', tab: 'movimientos' }],
      related: ['cuentas-y-saldos', 'transferencias', 'configuracion-de-tesoreria', 'ordenes-de-pago', 'tesoreria'],
    },
    {
      slug: 'transferencias',
      access: [tab('tesoreria', 'transferencias')],
      screens: [{ path: '/dashboard/treasury', tab: 'transferencias' }],
      related: ['cuentas-y-saldos', 'movimientos-de-tesoreria', 'tesoreria'],
    },
    {
      slug: 'configuracion-de-tesoreria',
      access: [tab('tesoreria', 'config-tesoreria')],
      screens: [{ path: '/dashboard/treasury', tab: 'config-tesoreria' }],
      related: ['cuentas-y-saldos', 'movimientos-de-tesoreria', 'ordenes-de-pago', 'configuracion-de-compras', 'tesoreria'],
    },
  ],
});
