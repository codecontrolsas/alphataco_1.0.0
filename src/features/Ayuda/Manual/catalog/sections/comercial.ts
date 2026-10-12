import { defineSection, tab } from '../define.ts';

export const comercialSection = defineSection({
  key: 'comercial',
  title: 'Comercial',
  description: 'Clientes, contratos, precios, certificaciones y facturación.',
  icon: 'commercial',
  guides: [
    {
      slug: 'clientes',
      access: [tab('comercial', 'customers')],
      covers: [
        tab('comercial', 'comerce'),
        tab('comercial', 'detalle-cliente'),
        tab('comercial', 'empleados-cliente'),
        tab('comercial', 'equipos-cliente'),
        tab('comercial', 'areas-cliente'),
        tab('comercial', 'sectores-cliente'),
      ],
      screens: [
        { path: '/dashboard/comercial', tab: 'comerce', subtab: 'customers' },
        { path: '/dashboard/comercial' },
        { path: '/dashboard/comercial', tab: 'comerce' },
        { path: '/dashboard/configuration/customers/action' },
      ],
      related: ['contratos', 'del-pedido-a-la-factura', 'diagramas-afectaciones-y-desvios', 'documentos-alertas-y-estado', 'facturacion', 'cuenta-corriente-de-clientes'],
    },
    {
      slug: 'contratos',
      access: [tab('comercial', 'service')],
      covers: [
        tab('comercial', 'detalle-contrato'),
        tab('comercial', 'documentos-contrato'),
        tab('comercial', 'items-contrato'),
      ],
      screens: [{ path: '/dashboard/comercial', tab: 'comerce', subtab: 'service' }],
      related: ['clientes', 'unidades-de-medida', 'reglas-de-precio', 'certificaciones', 'del-pedido-a-la-factura'],
    },
    {
      slug: 'unidades-de-medida',
      access: [tab('comercial', 'mensure_units')],
      screens: [{ path: '/dashboard/comercial', tab: 'comerce', subtab: 'mensure_units' }],
      related: ['contratos'],
    },
    {
      slug: 'reglas-de-precio',
      access: [tab('comercial', 'reglas-precio')],
      screens: [{ path: '/dashboard/comercial', tab: 'comerce', subtab: 'reglas-precio' }],
      related: ['contratos', 'certificaciones'],
    },
    {
      slug: 'partes-diarios-comercial',
      access: [tab('comercial', 'daily_reports')],
      screens: [{ path: '/dashboard/comercial', tab: 'comerce', subtab: 'daily_reports' }],
      related: ['partes-diarios', 'detalle-del-parte', 'certificaciones', 'del-pedido-a-la-factura'],
    },
    {
      slug: 'certificaciones',
      access: [tab('comercial', 'certificaciones')],
      screens: [{ path: '/dashboard/comercial', tab: 'comerce', subtab: 'certificaciones' }],
      related: ['del-pedido-a-la-factura', 'partes-diarios-comercial', 'contratos', 'facturacion'],
    },
    {
      slug: 'facturacion',
      access: [tab('comercial', 'facturacion')],
      screens: [
        { path: '/dashboard/comercial', tab: 'comerce', subtab: 'facturacion' },
        { path: '/dashboard/comercial/facturacion' },
      ],
      related: ['datos-fiscales', 'certificaciones', 'clientes', 'del-pedido-a-la-factura', 'cobrar-facturas'],
    },
  ],
});
