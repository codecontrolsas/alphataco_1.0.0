import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkPermissionServer, reportFindFirst, rowFindFirst } = vi.hoisted(() => ({
  checkPermissionServer: vi.fn(),
  reportFindFirst: vi.fn(),
  rowFindFirst: vi.fn(),
}));

vi.mock('@/features/Permissions/actions/permissions.server', () => ({ checkPermissionServer }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { dailyreport: { findFirst: reportFindFirst }, dailyreportrows: { findFirst: rowFindFirst } },
}));

import {
  RowRuleError,
  assertRowDeletableUnderLock,
  assertRowEditableUnderLock,
  assertStatusSettable,
  authorizeBulkRowUpdate,
  authorizeRowCreate,
  authorizeRowDelete,
  authorizeRowUpdate,
} from './row-guards';

const COMPANY = 'company-1';
/** 2026-10-21 15:00 UTC = mediodía del 21 en Argentina. */
const NOW = new Date('2026-10-21T15:00:00Z');
const TODAY = '2026-10-21';
const PAST = '2026-10-10';

/** `update`, `delete` y `assign_resources` concedidos o no. */
function grant(granted: Array<'update' | 'delete' | 'assign_resources'>) {
  checkPermissionServer.mockImplementation(async (_module: string, _tab: string, action: string) =>
    granted.includes(action as 'update')
  );
}

function row(status: string, date: string, preparteId: string | null = null) {
  rowFindFirst.mockResolvedValue({
    id: 'row-1',
    status,
    preparte_id: preparteId,
    dailyreport: { date: new Date(`${date}T00:00:00Z`) },
  });
}

function report(status: string, date: string) {
  reportFindFirst.mockResolvedValue({ status, date: new Date(`${date}T00:00:00Z`) });
}

function lockedTx(status: string | null) {
  return { $queryRaw: vi.fn().mockResolvedValue(status ? [{ status }] : []) } as never;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  checkPermissionServer.mockReset();
  reportFindFirst.mockReset();
  rowFindFirst.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('assertStatusSettable', () => {
  it('rechaza en_certificacion: lo asigna solo el flujo de certificación', () => {
    expect(() => assertStatusSettable('en_certificacion')).toThrow(RowRuleError);
  });

  it.each(['pendiente', 'sin_recursos_asignados', 'ejecutado', 'reprogramado', 'cancelado'])('acepta %s', (status) => {
    expect(() => assertStatusSettable(status)).not.toThrow();
  });
});

describe('authorizeRowCreate', () => {
  it('permite crear con permiso update y parte abierto', async () => {
    grant(['update']);
    report('abierto', PAST);
    await expect(authorizeRowCreate('rep-1', COMPANY)).resolves.toBeUndefined();
  });

  it('permite crear en el parte de hoy aunque esté cerrado', async () => {
    grant(['update']);
    report('cerrado', TODAY);
    await expect(authorizeRowCreate('rep-1', COMPANY)).resolves.toBeUndefined();
  });

  it('rechaza un parte cerrado de otra fecha', async () => {
    grant(['update']);
    report('cerrado', PAST);
    await expect(authorizeRowCreate('rep-1', COMPANY)).rejects.toThrow(RowRuleError);
  });

  it('rechaza sin permiso update (assign_resources y delete no alcanzan)', async () => {
    grant(['assign_resources', 'delete']);
    report('abierto', TODAY);
    await expect(authorizeRowCreate('rep-1', COMPANY)).rejects.toThrow(/permiso/);
  });

  it('rechaza si el parte no existe en la empresa', async () => {
    grant(['update']);
    reportFindFirst.mockResolvedValue(null);
    await expect(authorizeRowCreate('rep-1', COMPANY)).rejects.toThrow(RowRuleError);
  });
});

describe('authorizeRowUpdate', () => {
  it('con permiso update y línea editable, edición completa', async () => {
    grant(['update']);
    row('pendiente', PAST);
    await expect(authorizeRowUpdate('row-1', COMPANY)).resolves.toEqual({
      scope: 'full',
      reportDate: PAST,
      preparteId: null,
    });
  });

  it('devuelve el preparte guardado para validar el perímetro solo si cambia', async () => {
    grant(['update']);
    row('pendiente', TODAY, 'preparte-9');
    await expect(authorizeRowUpdate('row-1', COMPANY)).resolves.toMatchObject({ preparteId: 'preparte-9' });
  });

  it('con solo assign_resources, alcance acotado a recursos', async () => {
    grant(['assign_resources']);
    row('pendiente', PAST);
    await expect(authorizeRowUpdate('row-1', COMPANY)).resolves.toMatchObject({ scope: 'resources' });
  });

  it('con update y assign_resources gana la edición completa', async () => {
    grant(['update', 'assign_resources']);
    row('pendiente', TODAY);
    await expect(authorizeRowUpdate('row-1', COMPANY)).resolves.toMatchObject({ scope: 'full' });
  });

  it('rechaza una línea en certificación', async () => {
    grant(['update', 'assign_resources']);
    row('en_certificacion', TODAY);
    await expect(authorizeRowUpdate('row-1', COMPANY)).rejects.toThrow(RowRuleError);
  });

  it('rechaza una línea ejecutada de un parte anterior, pero permite la de hoy', async () => {
    grant(['update']);
    row('ejecutado', PAST);
    await expect(authorizeRowUpdate('row-1', COMPANY)).rejects.toThrow(RowRuleError);

    row('ejecutado', TODAY);
    await expect(authorizeRowUpdate('row-1', COMPANY)).resolves.toMatchObject({ scope: 'full' });
  });

  it('rechaza sin ningún permiso', async () => {
    grant(['delete']);
    row('pendiente', TODAY);
    await expect(authorizeRowUpdate('row-1', COMPANY)).rejects.toThrow(/permiso/);
  });

  it('rechaza una línea que no es de la empresa', async () => {
    grant(['update']);
    rowFindFirst.mockResolvedValue(null);
    await expect(authorizeRowUpdate('row-1', COMPANY)).rejects.toThrow(RowRuleError);
  });
});

describe('authorizeRowDelete', () => {
  it('permite eliminar en el parte de hoy o futuro', async () => {
    grant(['delete']);
    row('pendiente', TODAY);
    await expect(authorizeRowDelete('row-1', COMPANY)).resolves.toEqual({ reportDate: TODAY });
  });

  it('permite eliminar una línea sin recursos de un parte pasado', async () => {
    grant(['delete']);
    row('sin_recursos_asignados', PAST);
    await expect(authorizeRowDelete('row-1', COMPANY)).resolves.toEqual({ reportDate: PAST });
  });

  it('rechaza una línea con recursos de un parte pasado', async () => {
    grant(['delete']);
    row('pendiente', PAST);
    await expect(authorizeRowDelete('row-1', COMPANY)).rejects.toThrow(RowRuleError);
  });

  it('rechaza sin permiso delete', async () => {
    grant(['update']);
    row('sin_recursos_asignados', TODAY);
    await expect(authorizeRowDelete('row-1', COMPANY)).rejects.toThrow(/permiso/);
  });
});

describe('authorizeBulkRowUpdate', () => {
  it('rechaza sin permiso update', async () => {
    grant(['assign_resources', 'delete']);
    await expect(authorizeBulkRowUpdate({ status: 'ejecutado' })).rejects.toThrow(/permiso/);
  });

  it.each(['ejecutado', 'cancelado', 'reprogramado'])('acepta el estado %s con sus datos', async (status) => {
    grant(['update']);
    await expect(
      authorizeBulkRowUpdate({ status, cancel_reason: 'lluvia', reschedule_date: '2026-10-25' })
    ).resolves.toBeUndefined();
  });

  it('acepta completar diurno y nocturno', async () => {
    grant(['update']);
    await expect(authorizeBulkRowUpdate({ completar_diurno: true })).resolves.toBeUndefined();
    await expect(authorizeBulkRowUpdate({ completar_nocturno: true })).resolves.toBeUndefined();
  });

  it('rechaza estados que el modal no ofrece (en_certificacion, pendiente, texto libre)', async () => {
    grant(['update']);
    for (const status of ['en_certificacion', 'pendiente', 'sin_recursos_asignados', 'cualquier-cosa']) {
      await expect(authorizeBulkRowUpdate({ status })).rejects.toThrow(RowRuleError);
    }
    await expect(authorizeBulkRowUpdate({})).rejects.toThrow(RowRuleError);
  });

  it('rechaza completar combinado con un estado', async () => {
    grant(['update']);
    await expect(authorizeBulkRowUpdate({ completar_diurno: true, status: 'ejecutado' })).rejects.toThrow(RowRuleError);
  });

  it('exige motivo para cancelar y fecha válida para reprogramar', async () => {
    grant(['update']);
    await expect(authorizeBulkRowUpdate({ status: 'cancelado' })).rejects.toThrow(/motivo/);
    await expect(authorizeBulkRowUpdate({ status: 'cancelado', cancel_reason: '  ' })).rejects.toThrow(/motivo/);
    await expect(authorizeBulkRowUpdate({ status: 'reprogramado' })).rejects.toThrow(/fecha/);
    await expect(authorizeBulkRowUpdate({ status: 'reprogramado', reschedule_date: '25/10/2026' })).rejects.toThrow(/fecha/);
  });
});

describe('reevaluación con la fila bloqueada (carreras)', () => {
  it('rechaza editar si en el medio la línea pasó a certificación', async () => {
    await expect(
      assertRowEditableUnderLock(lockedTx('en_certificacion'), 'row-1', { scope: 'full', reportDate: TODAY, preparteId: null })
    ).rejects.toThrow(RowRuleError);
  });

  it('permite editar si la línea sigue pendiente', async () => {
    await expect(
      assertRowEditableUnderLock(lockedTx('pendiente'), 'row-1', { scope: 'resources', reportDate: PAST, preparteId: null })
    ).resolves.toBeUndefined();
  });

  it('rechaza editar si en el medio la línea quedó ejecutada y el parte no es de hoy', async () => {
    await expect(
      assertRowEditableUnderLock(lockedTx('ejecutado'), 'row-1', { scope: 'full', reportDate: PAST, preparteId: null })
    ).rejects.toThrow(RowRuleError);
  });

  it('rechaza eliminar si en el medio le asignaron recursos a una línea de un parte pasado', async () => {
    await expect(assertRowDeletableUnderLock(lockedTx('pendiente'), 'row-1', PAST)).rejects.toThrow(RowRuleError);
    await expect(assertRowDeletableUnderLock(lockedTx('sin_recursos_asignados'), 'row-1', PAST)).resolves.toBeUndefined();
  });

  it('falla si la línea ya no existe', async () => {
    await expect(
      assertRowEditableUnderLock(lockedTx(null), 'row-1', { scope: 'full', reportDate: TODAY, preparteId: null })
    ).rejects.toThrow(RowRuleError);
  });
});
