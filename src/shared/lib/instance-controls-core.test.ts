import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTANCE_CONTROLS,
  DEFAULT_PAUSE_MESSAGE,
  bannerDismissToken,
  computeInstanceVersion,
  controlsFromSettings,
  parseBanner,
  parsePause,
  pauseMessageOf,
  type InstanceEditableState,
} from './instance-controls-core';

/** Controles de instancia (pausa y banners): lectura tolerante de lo guardado y versión de concurrencia. */
const BASE: InstanceEditableState = { maxCompanies: 1, ...DEFAULT_INSTANCE_CONTROLS };

describe('lectura de instance_settings', () => {
  it('sin filas o con basura: todo apagado', () => {
    expect(controlsFromSettings([])).toEqual(DEFAULT_INSTANCE_CONTROLS);
    expect(
      controlsFromSettings([
        { key: 'instance_pause', value: 'sí' },
        { key: 'banner_login', value: [1, 2] },
        { key: 'banner_dashboard', value: { enabled: 'true', message: 3 } },
      ])
    ).toEqual(DEFAULT_INSTANCE_CONTROLS);
  });

  it('pausa activa con mensaje y fecha; `since` solo cuenta si está activa', () => {
    const since = '2026-10-29T12:00:00.000Z';
    expect(parsePause({ active: true, message: '  Volvemos 14 h  ', since })).toEqual({
      active: true,
      message: 'Volvemos 14 h',
      since,
    });
    expect(parsePause({ active: false, message: 'x', since }).since).toBeNull();
    expect(parsePause({ active: true, since: 'ayer' }).since).toBeNull();
  });

  it('banner: sin mensaje no se enciende, severidad desconocida es info, se quitan caracteres de control', () => {
    expect(parseBanner({ enabled: true, message: '   ', severity: 'critical' }).enabled).toBe(false);
    expect(parseBanner({ enabled: true, message: 'Hola', severity: 'urgente' }).severity).toBe('info');
    expect(parseBanner({ enabled: true, message: 'a\u0000b\u0007c\nd', severity: 'warning' })).toEqual({
      enabled: true,
      message: 'abc\nd',
      severity: 'warning',
    });
    expect(parseBanner({ enabled: true, message: 'x'.repeat(400) }).message).toHaveLength(280);
  });

  it('mensaje de la pausa: el propio o el genérico', () => {
    expect(pauseMessageOf({ active: true, message: '', since: null })).toBe(DEFAULT_PAUSE_MESSAGE);
    expect(pauseMessageOf({ active: true, message: 'Mantenimiento', since: null })).toBe('Mantenimiento');
  });
});

describe('versión de concurrencia', () => {
  it('es estable y cambia con cualquier campo editable', () => {
    const version = computeInstanceVersion(BASE);
    expect(version).toMatch(/^[0-9a-f]{64}$/);
    expect(computeInstanceVersion({ ...BASE })).toBe(version);
    const variants: InstanceEditableState[] = [
      { ...BASE, maxCompanies: 2 },
      { ...BASE, pause: { active: true, message: '', since: '2026-10-29T12:00:00.000Z' } },
      { ...BASE, pause: { ...BASE.pause, message: 'otro' } },
      { ...BASE, banners: { ...BASE.banners, login: { enabled: true, message: 'Hola', severity: 'info' } } },
      { ...BASE, banners: { ...BASE.banners, dashboard: { ...BASE.banners.dashboard, severity: 'critical' } } },
    ];
    for (const variant of variants) expect(computeInstanceVersion(variant)).not.toBe(version);
  });

  it('la huella de descarte cambia con el texto o la severidad', () => {
    const banner = { enabled: true, message: 'Corte programado', severity: 'info' as const };
    expect(bannerDismissToken(banner)).toBe(bannerDismissToken({ ...banner }));
    expect(bannerDismissToken({ ...banner, message: 'Corte reprogramado' })).not.toBe(bannerDismissToken(banner));
    expect(bannerDismissToken({ ...banner, severity: 'warning' })).not.toBe(bannerDismissToken(banner));
  });
});
