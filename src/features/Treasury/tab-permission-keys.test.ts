import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/features/Permissions/permissions-map';

/**
 * Las tabs de Tesorería deciden que botones mostrar con claves `modulo:tab:accion` escritas a mano
 * (`permissions['tesoreria:movimientos:create']`). Una clave mal escrita no la detecta el compilador y el
 * boton desaparece para todos (paso con Cotizaciones y Ordenes). Este test valida cada clave contra
 * el mapa de permisos (mismo test que Compras). También revisa las páginas armadas en `*Pages.tsx`.
 */

const root = join(process.cwd(), 'src/features/Treasury');

function tabContents(): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(root, dir.name))
        .filter((file) => file.endsWith('TabContent.tsx') || file.endsWith('Pages.tsx'))
        .map((file) => join(root, dir.name, file))
    );
}

describe('claves de permiso de las tabs de Tesorería', () => {
  const files = tabContents();

  it('encuentra las tabs', () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  for (const file of files) {
    it(`${file.split('/').slice(-2).join('/')} usa claves que existen`, () => {
      const keys = [...readFileSync(file, 'utf8').matchAll(/permissions\['([^']+)'\]/g)].map((m) => m[1]!);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const [module, tab, action] = key.split(':');
        const tabs = PERMISSIONS[module as keyof typeof PERMISSIONS]?.tabs as
          | Record<string, { allowedActions: readonly string[] }>
          | undefined;
        expect(tabs?.[tab ?? '']?.allowedActions ?? [], key).toContain(action);
      }
    });
  }
});
