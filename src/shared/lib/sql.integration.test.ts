import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Integración real contra el Postgres del compose. Corre sólo con DATABASE_URL definido:
 *   DATABASE_URL=postgresql://alphataco:devpass@127.0.0.1:55432/alphataco npx vitest run src/shared/lib/sql.integration.test.ts
 * El import es dinámico porque `@/shared/lib/prisma` lanza al cargarse sin DATABASE_URL.
 */
describe.skipIf(!process.env.DATABASE_URL)('callFunction (integración)', () => {
  it('callScalar devuelve un escalar validado', async () => {
    const { callScalar } = await import('./sql');
    // `app_current_user_id()` devuelve NULL fuera de una transacción con actor.
    const value = await callScalar('app_current_user_id', [], z.string().uuid().nullable());
    expect(value).toBeNull();
  });

  it('callVoid ejecuta una función void sin fallar por deserialización (P2010)', async () => {
    const { callVoid } = await import('./sql');
    // Con array vacío la función retorna sin escribir nada: sirve para probar el binding `::uuid[]`.
    await expect(callVoid('recalcular_status_documentacion', [{ uuidArray: [] }, 'Persona'])).resolves.toBeUndefined();
  });

  it('{ date } resuelve funciones con parámetros date (process_massive_novelty_creation con empleados vacíos)', async () => {
    const { callScalar } = await import('./sql');
    // Con una novedad inexistente la función valida y devuelve success=false (array_length de `{}` es NULL,
    // así que el chequeo de empleados no corta): prueba el binding `::date` y `::uuid[]` sin escribir nada.
    const raw = await callScalar(
      'process_massive_novelty_creation',
      [
        { uuidArray: [] },
        { uuid: '00000000-0000-0000-0000-000000000000' },
        { date: '2026-03-01' },
        { date: new Date(2026, 2, 5) },
        'skip',
      ],
      z.object({ success: z.boolean(), error: z.string().optional() })
    );
    expect(raw.success).toBe(false);
    expect(raw.error).toMatch(/Novedad no encontrada/);
  });

  it('update_employee_diagram_status devuelve json con success=false para un empleado inexistente', async () => {
    const { callScalar } = await import('./sql');
    const result = await callScalar(
      'update_employee_diagram_status',
      [{ uuid: '00000000-0000-0000-0000-000000000000' }, false],
      z.object({ success: z.boolean(), affected_rows: z.coerce.number().optional() })
    );
    expect(result).toEqual({ success: false, affected_rows: 0 });
  });

  it('rechaza nombres inválidos sin tocar la base', async () => {
    const { callFunction } = await import('./sql');
    await expect(callFunction('company; drop', [], z.array(z.unknown()))).rejects.toThrow(
      'Nombre de función SQL inválido'
    );
  });
});
