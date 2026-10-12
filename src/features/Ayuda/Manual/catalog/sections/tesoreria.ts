import { defineSection, tab } from '../define.ts';

/**
 * Módulo Tesorería (`/dashboard/treasury`). Cada sección del menú es un `?tab=`; el extracto de
 * una cuenta tiene el id en la URL y se declara con el comodín `/*`.
 */
export const tesoreriaSection = defineSection({
  key: 'tesoreria',
  title: 'Tesorería',
  description: 'Saldos de cuentas bancarias y cajas, extracto, movimientos manuales, transferencias entre cuentas, el reflejo de los pagos a proveedores, las cobranzas a clientes con sus retenciones y la cartera de cheques de terceros.',
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
        tab('tesoreria', 'cobranzas'),
        tab('tesoreria', 'cheques'),
        tab('tesoreria', 'cheques-propios'),
        tab('tesoreria', 'conciliacion'),
        tab('tesoreria', 'retenciones-sufridas'),
      ],
      screens: [{ path: '/dashboard/treasury' }],
      related: ['cuentas-y-saldos', 'movimientos-de-tesoreria', 'transferencias', 'cobrar-facturas', 'cartera-de-cheques', 'configuracion-de-tesoreria', 'ordenes-de-pago'],
    },
    {
      slug: 'cuentas-y-saldos',
      access: [tab('tesoreria', 'cuentas')],
      screens: [
        { path: '/dashboard/treasury', tab: 'cuentas' },
        { path: '/dashboard/treasury/accounts/*' },
      ],
      related: ['tesoreria', 'movimientos-de-tesoreria', 'transferencias', 'ordenes-de-pago', 'conciliacion-bancaria'],
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
      {
      slug: 'cobrar-facturas',
      access: [tab('tesoreria', 'cobranzas')],
      screens: [
        { path: '/dashboard/treasury', tab: 'cobranzas' },
        { path: '/dashboard/treasury/receipts/*' },
      ],
      related: ['cobros-en-moneda-extranjera', 'anticipos-de-clientes', 'retenciones-sufridas', 'cuenta-corriente-de-clientes', 'cartera-de-cheques', 'anular-un-recibo', 'facturacion'],
    },
    {
      slug: 'cobros-en-moneda-extranjera',
      access: [tab('tesoreria', 'cobranzas')],
      screens: [],
      related: ['cobrar-facturas', 'cuenta-corriente-de-clientes', 'facturacion'],
    },
    {
      slug: 'anticipos-de-clientes',
      access: [tab('tesoreria', 'cobranzas')],
      screens: [],
      related: ['cobrar-facturas', 'cuenta-corriente-de-clientes', 'anular-un-recibo'],
    },
    {
      slug: 'retenciones-sufridas',
      access: [tab('tesoreria', 'retenciones-sufridas'), tab('tesoreria', 'cobranzas')],
      screens: [{ path: '/dashboard/treasury', tab: 'retenciones-sufridas' }],
      related: ['cobrar-facturas', 'retenciones', 'tesoreria'],
    },
    {
      slug: 'cuenta-corriente-de-clientes',
      access: [tab('tesoreria', 'cobranzas')],
      screens: [{ path: '/dashboard/treasury/customers/*' }],
      related: ['cobrar-facturas', 'anticipos-de-clientes', 'cobros-en-moneda-extranjera', 'rechazo-de-un-cheque', 'clientes', 'facturacion'],
    },
    {
      slug: 'anular-un-recibo',
      access: [tab('tesoreria', 'cobranzas')],
      screens: [],
      related: ['cobrar-facturas', 'anticipos-de-clientes', 'cartera-de-cheques', 'cuentas-y-saldos'],
    },
    // Etapa 3a: cheques de terceros.
    {
      slug: 'cartera-de-cheques',
      access: [tab('tesoreria', 'cheques')],
      screens: [
        { path: '/dashboard/treasury', tab: 'cheques' },
        { path: '/dashboard/treasury/checks/*' },
      ],
      related: ['depositar-y-descontar-cheques', 'rechazo-de-un-cheque', 'endosar-cheques', 'cobrar-facturas', 'configuracion-de-tesoreria', 'cheques-propios'],
    },
    {
      slug: 'depositar-y-descontar-cheques',
      access: [tab('tesoreria', 'cheques')],
      screens: [],
      related: ['cartera-de-cheques', 'rechazo-de-un-cheque', 'cuentas-y-saldos'],
    },
    {
      slug: 'rechazo-de-un-cheque',
      access: [tab('tesoreria', 'cheques')],
      screens: [],
      related: ['cartera-de-cheques', 'cuenta-corriente-de-clientes', 'cobrar-facturas', 'cuenta-corriente-y-vencimientos', 'endosar-cheques'],
    },
    // Etapa 3b: cheques propios.
    {
      slug: 'cheques-propios',
      access: [tab('tesoreria', 'cheques-propios')],
      screens: [
        { path: '/dashboard/treasury', tab: 'cheques-propios' },
        { path: '/dashboard/treasury/own-checks/*' },
      ],
      related: ['chequeras', 'ordenes-de-pago', 'cuentas-y-saldos', 'cuenta-corriente-y-vencimientos', 'cartera-de-cheques'],
    },
    {
      slug: 'chequeras',
      access: [tab('tesoreria', 'cheques-propios')],
      screens: [],
      related: ['cheques-propios', 'ordenes-de-pago', 'configuracion-de-tesoreria'],
    },
    // Etapa 4: conciliación bancaria.
    {
      slug: 'conciliacion-bancaria',
      access: [tab('tesoreria', 'conciliacion')],
      screens: [{ path: '/dashboard/treasury', tab: 'conciliacion' }],
      related: ['perfil-de-extracto', 'cuentas-y-saldos', 'movimientos-de-tesoreria', 'cheques-propios', 'configuracion-de-tesoreria'],
    },
    {
      slug: 'perfil-de-extracto',
      access: [tab('tesoreria', 'conciliacion')],
      screens: [],
      related: ['conciliacion-bancaria'],
    },
  ],
});
