import { describe, expect, it } from 'vitest';
import { canApplyRequestAction, statusAfterDeliveries } from './request-state-machine';

describe('canApplyRequestAction', () => {
  it('solo un pedido pendiente se aprueba, rechaza o cancela', () => {
    expect(canApplyRequestAction('PENDING_APPROVAL', 'approve')).toBe(true);
    expect(canApplyRequestAction('PENDING_APPROVAL', 'reject')).toBe(true);
    expect(canApplyRequestAction('PENDING_APPROVAL', 'cancel')).toBe(true);
    expect(canApplyRequestAction('APPROVED', 'approve')).toBe(false);
    expect(canApplyRequestAction('APPROVED', 'cancel')).toBe(false);
  });

  it('se entrega y se cierra lo aprobado o parcialmente entregado', () => {
    expect(canApplyRequestAction('APPROVED', 'deliver')).toBe(true);
    expect(canApplyRequestAction('PARTIALLY_DELIVERED', 'deliver')).toBe(true);
    expect(canApplyRequestAction('PARTIALLY_DELIVERED', 'close')).toBe(true);
    expect(canApplyRequestAction('PENDING_APPROVAL', 'deliver')).toBe(false);
    expect(canApplyRequestAction('DELIVERED', 'deliver')).toBe(false);
    expect(canApplyRequestAction('DELIVERED', 'close')).toBe(false);
    expect(canApplyRequestAction('CLOSED', 'deliver')).toBe(false);
  });
});

describe('statusAfterDeliveries', () => {
  const lines = (...pairs: [number, number][]) => pairs.map(([requested, delivered]) => ({ requested, delivered }));

  it('nada entregado vuelve a aprobado', () => {
    expect(statusAfterDeliveries('PARTIALLY_DELIVERED', lines([10, 0], [2, 0]))).toBe('APPROVED');
  });

  it('algo entregado es parcial', () => {
    expect(statusAfterDeliveries('APPROVED', lines([10, 4], [2, 0]))).toBe('PARTIALLY_DELIVERED');
  });

  it('todas las lineas completas es entregado', () => {
    expect(statusAfterDeliveries('PARTIALLY_DELIVERED', lines([10, 10], [2, 2]))).toBe('DELIVERED');
  });

  it('anular una entrega de un pedido entregado lo reabre', () => {
    expect(statusAfterDeliveries('DELIVERED', lines([10, 6]))).toBe('PARTIALLY_DELIVERED');
  });

  it('un pedido cerrado sigue cerrado', () => {
    expect(statusAfterDeliveries('CLOSED', lines([10, 0]))).toBe('CLOSED');
    expect(statusAfterDeliveries('REJECTED', lines([10, 10]))).toBe('REJECTED');
  });
});
