import { describe, expect, it } from 'vitest';
import { resolveVisibleTabs } from './tabs-visibility';

/**
 * El sidebar no puede ofrecer una tab que la página no va a montar: `TabsManagerServer`
 * decide con `view` explícito o visibilidad inferida, y acá se replica esa regla.
 */
describe('resolveVisibleTabs', () => {
  it('sin permisos no deja ninguna tab visible', () => {
    const visible = resolveVisibleTabs({});

    expect(visible.documentacion).toEqual([]);
    expect(visible.mantenimiento).toEqual([]);
  });

  it('muestra la tab con view explícito', () => {
    const visible = resolveVisibleTabs({ 'documentacion:documentos-de-equipos:view': true });

    expect(visible.documentacion).toEqual(['documentos-de-equipos']);
  });

  it('ubica en Configuración las secciones que se mudaron de otros módulos', () => {
    const visible = resolveVisibleTabs({
      'configuracion:mantenimiento:view': true,
      'configuracion:documentos:view': true,
    });

    expect(visible.configuracion).toEqual(['mantenimiento', 'documentos']);
    expect(visible.mantenimiento).not.toContain('maint_configuracion');
    expect(visible.documentacion).not.toContain('tipos-de-documentos');
  });

  it('Mantenimiento se ve aunque el permiso esté sólo en una de sus cuatro pantallas', () => {
    // Las 4 (talleres, sectores, tipos de reparación, grupos) son subtabs de una sola sección:
    // alcanza con tener `view` en cualquiera para que la sección aparezca (visibilidad inferida).
    const visible = resolveVisibleTabs({ 'configuracion:type_of_repair:view': true });

    expect(visible.configuracion).toContain('mantenimiento');
  });

  it('ignora el permiso en false', () => {
    const visible = resolveVisibleTabs({ 'documentacion:documentos-de-equipos:view': false });

    expect(visible.documentacion).toEqual([]);
  });

  it('ignora acciones que no son view', () => {
    const visible = resolveVisibleTabs({ 'documentacion:documentos-de-equipos:create': true });

    expect(visible.documentacion).toEqual([]);
  });

  it('infiere la tab padre cuando el permiso está en una subtab', () => {
    // `empleados:employees` (Personal) no tiene view propio, pero sí su subtab `empleados-inactivos` (Bajas).
    const visible = resolveVisibleTabs({ 'empleados:empleados-inactivos:view': true });

    expect(visible.empleados).toEqual(['employees']);
  });

  it('no mezcla módulos que comparten el slug de tab', () => {
    // `vehicles` existe en equipos (subtab de `equipos`) y en configuracion (tab propia).
    const visible = resolveVisibleTabs({ 'configuracion:vehicles:view': true });

    expect(visible.configuracion).toContain('vehicles');
    expect(visible.equipos).not.toContain('vehicles');
  });

  it('conserva el orden declarado en navigationLinks, no el de los permisos', () => {
    const visible = resolveVisibleTabs({
      'documentacion:documentos-de-empresa:view': true,
      'documentacion:documentos-de-empleados:view': true,
    });

    expect(visible.documentacion).toEqual(['documentos-de-empleados', 'documentos-de-empresa']);
  });

  it('no declara entradas para los módulos sin sub-items', () => {
    const visible = resolveVisibleTabs({ 'comercial:comerce:view': true, 'formularios:formularios:view': true });

    // Comercial declara sub-items, pero cada uno exige su propio `view`: sin ellos no se ve ninguno.
    expect(visible.comercial).toEqual([]);
    expect(visible.formularios).toBeUndefined();
  });
});

describe('resolveVisibleTabs en Equipos', () => {
  it('ofrece como sub-items las subtabs de `equipos`, cada una con su propio permiso', () => {
    // Vehículos, Equipamiento y Dados de Baja son subtabs de `equipos` en permissions-map,
    // pero en la página son secciones de primer nivel.
    const visible = resolveVisibleTabs({ 'equipos:others:view': true, 'equipos:inactive:view': true });

    expect(visible.equipos).toEqual(['others', 'inactive']);
  });

  it('el view de la tab padre no alcanza para ver sus subtabs', () => {
    const visible = resolveVisibleTabs({ 'equipos:equipos:view': true });

    expect(visible.equipos).toEqual([]);
  });
});
