import { defineSection, tab } from '../define.ts';

/**
 * Módulo Compras (`/dashboard/purchases`). Cada sección del menú es un `?tab=`; las pantallas de
 * detalle y de alta (solicitud, cotización, orden de compra, recepción, factura, orden de pago, proveedor) tienen el id en la URL y se declaran con el comodín
 * `/*` para que el botón "?" abra la guía de la sección desde la que se llega.
 */
export const comprasSection = defineSection({
  key: 'compras',
  title: 'Compras',
  description: 'Proveedores, solicitudes de compra, pedidos de cotización, órdenes de compra, recepciones, facturas de proveedor, Libro IVA Compras, órdenes de pago, cuenta corriente y retenciones.',
  icon: 'purchases',
  guides: [
    {
      slug: 'compras',
      // Guía de entrada al módulo: la ve quien tenga Ver en cualquiera de sus secciones.
      access: [
        tab('compras', 'solicitudes'),
        tab('compras', 'cotizaciones'),
        tab('compras', 'ordenes'),
        tab('compras', 'recepciones'),
        tab('compras', 'facturas'),
        tab('compras', 'libro-iva'),
        tab('compras', 'pagos'),
        tab('compras', 'retenciones'),
        tab('compras', 'proveedores'),
        tab('compras', 'config-compras'),
      ],
      screens: [{ path: '/dashboard/purchases' }],
      related: [
        'solicitudes-de-compra',
        'pedidos-de-cotizacion',
        'ordenes-de-compra',
        'recepciones',
        'facturas-de-proveedor',
        'libro-iva-compras',
        'ordenes-de-pago',
        'cuenta-corriente-y-vencimientos',
        'retenciones',
        'proveedores',
        'configuracion-de-compras',
        'pedidos-de-materiales',
      ],
    },
    {
      slug: 'solicitudes-de-compra',
      access: [tab('compras', 'solicitudes')],
      screens: [
        { path: '/dashboard/purchases', tab: 'solicitudes' },
        { path: '/dashboard/purchases/requests/*' },
      ],
      related: ['compras', 'pedidos-de-cotizacion', 'ordenes-de-compra', 'proveedores', 'pedidos-de-materiales', 'materiales'],
    },
    {
      slug: 'pedidos-de-cotizacion',
      access: [tab('compras', 'cotizaciones')],
      screens: [
        { path: '/dashboard/purchases', tab: 'cotizaciones' },
        { path: '/dashboard/purchases/quotes/*' },
      ],
      related: ['solicitudes-de-compra', 'ordenes-de-compra', 'proveedores', 'compras'],
    },
    {
      slug: 'ordenes-de-compra',
      access: [tab('compras', 'ordenes')],
      screens: [
        { path: '/dashboard/purchases', tab: 'ordenes' },
        { path: '/dashboard/purchases/orders/*' },
      ],
      related: ['solicitudes-de-compra', 'pedidos-de-cotizacion', 'recepciones', 'facturas-de-proveedor', 'proveedores', 'compras'],
    },
    {
      slug: 'recepciones',
      access: [tab('compras', 'recepciones')],
      screens: [
        { path: '/dashboard/purchases', tab: 'recepciones' },
        { path: '/dashboard/purchases/receipts/*' },
      ],
      related: ['ordenes-de-compra', 'solicitudes-de-compra', 'facturas-de-proveedor', 'movimientos-de-stock', 'compras'],
    },
    {
      slug: 'facturas-de-proveedor',
      access: [tab('compras', 'facturas')],
      screens: [
        { path: '/dashboard/purchases', tab: 'facturas' },
        { path: '/dashboard/purchases/invoices/*' },
      ],
      related: ['ordenes-de-compra', 'recepciones', 'libro-iva-compras', 'ordenes-de-pago', 'cuenta-corriente-y-vencimientos', 'configuracion-de-compras', 'compras'],
    },
    {
      slug: 'libro-iva-compras',
      access: [tab('compras', 'libro-iva')],
      screens: [{ path: '/dashboard/purchases', tab: 'libro-iva' }],
      related: ['facturas-de-proveedor', 'retenciones', 'compras'],
    },
    {
      slug: 'ordenes-de-pago',
      access: [tab('compras', 'pagos')],
      screens: [
        { path: '/dashboard/purchases', tab: 'pagos' },
        { path: '/dashboard/purchases/payments/*' },
      ],
      related: ['cuenta-corriente-y-vencimientos', 'retenciones', 'facturas-de-proveedor', 'proveedores', 'configuracion-de-compras', 'cuentas-y-saldos', 'configuracion-de-tesoreria', 'endosar-cheques', 'cheques-propios', 'chequeras', 'compras'],
    },
    {
      // Tesorería etapa 3a: el endoso se hace al registrar el pago de la orden.
      slug: 'endosar-cheques',
      access: [tab('compras', 'pagos')],
      screens: [],
      related: ['ordenes-de-pago', 'cartera-de-cheques', 'rechazo-de-un-cheque', 'cuenta-corriente-y-vencimientos'],
    },
    {
      slug: 'cuenta-corriente-y-vencimientos',
      access: [tab('compras', 'pagos')],
      related: ['ordenes-de-pago', 'facturas-de-proveedor', 'proveedores', 'compras'],
    },
    {
      slug: 'retenciones',
      access: [tab('compras', 'retenciones')],
      screens: [{ path: '/dashboard/purchases', tab: 'retenciones' }],
      related: ['ordenes-de-pago', 'proveedores', 'configuracion-de-compras', 'libro-iva-compras', 'compras'],
    },
    {
      slug: 'proveedores',
      access: [tab('compras', 'proveedores')],
      screens: [
        { path: '/dashboard/purchases', tab: 'proveedores' },
        { path: '/dashboard/purchases/suppliers/*' },
      ],
      related: ['compras', 'configuracion-de-compras', 'solicitudes-de-compra', 'ordenes-de-compra', 'cuenta-corriente-y-vencimientos', 'retenciones'],
    },
    {
      slug: 'configuracion-de-compras',
      access: [tab('compras', 'config-compras')],
      screens: [{ path: '/dashboard/purchases', tab: 'config-compras' }],
      related: ['proveedores', 'facturas-de-proveedor', 'ordenes-de-pago', 'retenciones', 'configuracion-de-tesoreria', 'compras'],
    },
  ],
});
