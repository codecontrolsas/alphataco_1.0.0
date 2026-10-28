import { describe, expect, it } from 'vitest';
import { appBaseUrl, normalizeBaseUrl, resolveAppBaseUrl } from './app-url';

describe('normalizeBaseUrl', () => {
  it('quita espacios y barras finales', () => {
    expect(normalizeBaseUrl('  https://a.example.com/// ')).toBe('https://a.example.com');
  });
  it('rechaza vacío, basura y protocolos que no son http(s)', () => {
    expect(normalizeBaseUrl(undefined)).toBeUndefined();
    expect(normalizeBaseUrl('   ')).toBeUndefined();
    expect(normalizeBaseUrl('no-es-url')).toBeUndefined();
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeUndefined();
  });
});

describe('resolveAppBaseUrl / appBaseUrl', () => {
  it('APP_BASE_URL gana sobre la variable heredada', () => {
    const env = { APP_BASE_URL: 'https://nueva.example.com/', NEXT_PUBLIC_BASE_URL: 'https://vieja.example.com' };
    expect(resolveAppBaseUrl(env)).toBe('https://nueva.example.com');
  });
  it('cae a NEXT_PUBLIC_BASE_URL del entorno si no hay APP_BASE_URL', () => {
    expect(resolveAppBaseUrl({ NEXT_PUBLIC_BASE_URL: 'https://vieja.example.com' })).toBe('https://vieja.example.com');
  });
  it('un APP_BASE_URL inválido no tapa al heredado', () => {
    expect(resolveAppBaseUrl({ APP_BASE_URL: 'xx', NEXT_PUBLIC_BASE_URL: 'http://h.example.com' })).toBe(
      'http://h.example.com'
    );
  });
  it('sin nada: undefined, y appBaseUrl devuelve localhost', () => {
    expect(resolveAppBaseUrl({})).toBeUndefined();
    expect(appBaseUrl({})).toBe('http://localhost:3000');
  });
  it('lee el entorno en cada llamada (no queda fijado)', () => {
    const env: Record<string, string | undefined> = { APP_BASE_URL: 'https://a.example.com' };
    expect(appBaseUrl(env)).toBe('https://a.example.com');
    env.APP_BASE_URL = 'https://b.example.com';
    expect(appBaseUrl(env)).toBe('https://b.example.com');
  });
});
