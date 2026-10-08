import { describe, expect, it } from 'vitest';

describe('openRequestsMessage', () => {
  it('nombra el pedido abierto', async () => {
    const { openRequestsMessage } = await import('./order-materials');
    expect(openRequestsMessage(['PED-000012'])).toBe(
      'PED-000012 sigue abierto: entregalo, cerralo o cancelalo antes de completar la orden'
    );
  });

  it('al rechazar la orden lo dice', async () => {
    const { openRequestsMessage } = await import('./order-materials');
    expect(openRequestsMessage(['PED-000012'], 'rechazar')).toBe(
      'PED-000012 sigue abierto: entregalo, cerralo o cancelalo antes de rechazar la orden'
    );
  });

  it('con varios, nombra el primero y cuenta el resto', async () => {
    const { openRequestsMessage } = await import('./order-materials');
    expect(openRequestsMessage(['PED-000012', 'PED-000013'])).toBe(
      'PED-000012 y 1 pedido más siguen abiertos: entregalos, cerralos o cancelalos antes de completar la orden'
    );
    expect(openRequestsMessage(['PED-000012', 'PED-000013', 'PED-000014'])).toBe(
      'PED-000012 y 2 pedidos más siguen abiertos: entregalos, cerralos o cancelalos antes de completar la orden'
    );
  });
});
