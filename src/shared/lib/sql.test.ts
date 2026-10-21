import { Prisma } from '@/generated/prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';

// `sql.ts` importa el cliente por defecto; en unit tests no hay DATABASE_URL.
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));

import { callFunction, callScalar, callVoid, type SqlClient, type VoidSqlClient } from './sql';

/** Cliente falso: captura el `Prisma.Sql` que recibe `$queryRaw` y devuelve `rows`. */
function fakeClient(rows: unknown[]) {
  const calls: Prisma.Sql[] = [];
  const client: SqlClient = {
    $queryRaw: vi.fn(async (query: TemplateStringsArray | Prisma.Sql) => {
      calls.push(query as Prisma.Sql);
      return rows;
    }) as unknown as SqlClient['$queryRaw'],
  };
  return { client, calls };
}

describe('callFunction', () => {
  it('lanza si el nombre de la función no es un identificador snake_case', async () => {
    const { client } = fakeClient([]);
    await expect(callFunction('drop table; --', [], z.array(z.unknown()), client)).rejects.toThrow(
      'Nombre de función SQL inválido'
    );
    await expect(callFunction('Mixed', [], z.array(z.unknown()), client)).rejects.toThrow(
      'Nombre de función SQL inválido'
    );
    await expect(callFunction('public.fn', [], z.array(z.unknown()), client)).rejects.toThrow(
      'Nombre de función SQL inválido'
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('genera SELECT * FROM public.<fn>($1, $2) y bindea los args como values', async () => {
    const { client, calls } = fakeClient([{ col_value: 'a', col_count: BigInt(1) }]);
    await callFunction('get_demo_values', ['company', "company_name'; --"], z.array(z.unknown()), client);

    expect(calls).toHaveLength(1);
    const query = calls[0];
    expect(query.text).toBe('SELECT * FROM public.get_demo_values($1, $2)');
    expect(query.values).toEqual(['company', "company_name'; --"]);
    // El texto nunca contiene los valores interpolados.
    expect(query.text).not.toContain('company_name');
  });

  it('sin args genera public.<fn>()', async () => {
    const { client, calls } = fakeClient([]);
    await callFunction('fn_sin_args', [], z.array(z.unknown()), client);
    expect(calls[0].text).toBe('SELECT * FROM public.fn_sin_args()');
    expect(calls[0].values).toEqual([]);
  });

  it('{ json } se bindea como string JSON con cast ::jsonb y { uuid } con ::uuid', async () => {
    const { client, calls } = fakeClient([]);
    const filters = { is_active: true, name: 'x' };
    await callFunction(
      'fn',
      [{ json: filters }, { uuid: '2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e' }, { json: null }],
      z.array(z.unknown()),
      client
    );
    expect(calls[0].text).toBe('SELECT * FROM public.fn($1::jsonb, $2::uuid, $3::jsonb)');
    expect(calls[0].values).toEqual([JSON.stringify(filters), '2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e', null]);
  });

  it('{ date } se bindea como texto YYYY-MM-DD con cast ::date (funciones con parámetros date)', async () => {
    const { client, calls } = fakeClient([{ value: {} }]);
    await callScalar(
      'process_massive_diagram_creation_v2',
      [{ date: '2026-03-01' }, { date: new Date(2026, 2, 31, 23, 30) }, { date: undefined }],
      z.unknown(),
      client
    );
    expect(calls[0].text).toBe('SELECT public.process_massive_diagram_creation_v2($1::date, $2::date, $3::date) AS value');
    expect(calls[0].values).toEqual(['2026-03-01', '2026-03-31', null]);
  });

  it('{ date } con texto que no es YYYY-MM-DD lanza sin ejecutar', async () => {
    const { client } = fakeClient([]);
    await expect(callFunction('fn', [{ date: '01/03/2026' }], z.array(z.unknown()), client)).rejects.toThrow(
      'Fecha inválida'
    );
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('undefined y { json: undefined } se bindean explícitamente como NULL', async () => {
    const { client, calls } = fakeClient([]);
    await callFunction('fn', [undefined, { json: undefined }, { uuid: undefined }], z.array(z.unknown()), client);
    expect(calls[0].text).toBe('SELECT * FROM public.fn($1, $2::jsonb, $3::uuid)');
    expect(calls[0].values).toEqual([null, null, null]);
  });

  it('valida el resultado con el schema Zod (bigint → number con coerce)', async () => {
    const { client } = fakeClient([{ col_value: 'Demo', col_count: BigInt(3) }]);
    const rows = await callFunction(
      'get_demo_values',
      ['company', 'company_name'],
      z.array(z.object({ col_value: z.string().nullable(), col_count: z.coerce.number() })),
      client
    );
    expect(rows).toEqual([{ col_value: 'Demo', col_count: 3 }]);
  });

  it('lanza ZodError si el resultado no cumple el schema', async () => {
    const { client } = fakeClient([{ col_value: 42 }]);
    await expect(
      callFunction('fn', [], z.array(z.object({ col_value: z.string() })), client)
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('callScalar', () => {
  it('genera SELECT public.<fn>($1) AS value y devuelve value validado', async () => {
    const { client, calls } = fakeClient([{ value: true }]);
    const result = await callScalar('user_has_permission', ['u1'], z.boolean(), client);
    expect(calls[0].text).toBe('SELECT public.user_has_permission($1) AS value');
    expect(calls[0].values).toEqual(['u1']);
    expect(result).toBe(true);
  });

  it('lanza si el nombre es inválido y si el valor no cumple el schema', async () => {
    const { client } = fakeClient([{ value: 'no-bool' }]);
    await expect(callScalar('1bad', [], z.boolean(), client)).rejects.toThrow('Nombre de función SQL inválido');
    await expect(callScalar('fn', [], z.boolean(), client)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('callVoid', () => {
  /** Doble de `$executeRaw`: captura el `Prisma.Sql` y devuelve 0 (las funciones void no afectan filas). */
  function fakeVoidClient() {
    const calls: Prisma.Sql[] = [];
    const client: VoidSqlClient = {
      $executeRaw: vi.fn(async (query: TemplateStringsArray | Prisma.Sql) => {
        calls.push(query as Prisma.Sql);
        return 0;
      }) as unknown as VoidSqlClient['$executeRaw'],
    };
    return { client, calls };
  }

  it('genera SELECT public.<fn>($1, $2) con $executeRaw (sin deserializar void) y bindea los args', async () => {
    const { client, calls } = fakeVoidClient();
    await callVoid(
      'controlar_alertas_documentos_single_employee',
      [{ uuid: '2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e' }, { uuid: '3f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e' }],
      client
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('SELECT public.controlar_alertas_documentos_single_employee($1::uuid, $2::uuid)');
    expect(calls[0].values).toEqual(['2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e', '3f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e']);
  });

  it('{ uuidArray } se bindea como array con cast ::uuid[]', async () => {
    const { client, calls } = fakeVoidClient();
    const ids = ['2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e'];
    await callVoid('recalcular_status_documentacion', [{ uuidArray: ids }, 'Persona'], client);
    expect(calls[0].text).toBe('SELECT public.recalcular_status_documentacion($1::uuid[], $2)');
    expect(calls[0].values).toEqual([ids, 'Persona']);
  });

  it('rechaza nombres inválidos sin ejecutar nada', async () => {
    const { client } = fakeVoidClient();
    await expect(callVoid('fn; drop table x', [], client)).rejects.toThrow('Nombre de función SQL inválido');
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});
