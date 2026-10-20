import { describe, expect, it } from 'vitest';
import { DASHBOARD_NAV_TAB_BY_TEMPLATE, findActiveBoardIndex } from './board-nav';
import { BOARD_TEMPLATES, WIDGETS, getWidgetDefinition, templateKeyFromLegacyParams } from './widget-registry';

describe('registro de widgets y tableros por defecto', () => {
  it('cada widget de una plantilla existe en el registro', () => {
    for (const template of BOARD_TEMPLATES) {
      for (const id of template.widgets) expect(getWidgetDefinition(id), `${template.key}: ${id}`).toBeDefined();
    }
  });

  it('entre todas las plantillas cubren todo el registro: nadie pierde un widget que hoy ve', () => {
    const used = new Set(BOARD_TEMPLATES.flatMap((template) => template.widgets as readonly string[]));
    expect(WIDGETS.filter((widget) => !used.has(widget.id)).map((widget) => widget.id)).toEqual([]);
  });

  it('el Resumen (#784) es la bandeja de pendientes y la plata, sin los indicadores heredados de GH', () => {
    const resumen = BOARD_TEMPLATES.find((template) => template.key === 'resumen');
    expect(resumen?.widgets).toEqual(['attention-inbox', 'cash-position']);
    const dia = BOARD_TEMPLATES.find((template) => template.key === 'dia');
    expect(dia?.widgets).toContain('kpi-employees');
    expect(dia?.widgets).toContain('services-today');
  });

  it('cada plantilla tiene su acceso de navegación', () => {
    for (const template of BOARD_TEMPLATES)
      expect(DASHBOARD_NAV_TAB_BY_TEMPLATE[template.key], template.key).toBeTruthy();
  });

  it('los links viejos ?tab=principal siguen abriendo el Resumen', () => {
    expect(templateKeyFromLegacyParams('principal', undefined)).toBe('resumen');
    const boards = BOARD_TEMPLATES.map((template) => ({ id: template.key, template: template.key }));
    expect(boards[findActiveBoardIndex(boards, { board: null, tab: 'principal', subtab: null })]?.template).toBe(
      'resumen'
    );
  });
});
