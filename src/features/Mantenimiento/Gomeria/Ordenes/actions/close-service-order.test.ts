import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  tire_service_orders: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/features/Mantenimiento/Gomeria/shared/access.server', () => ({
  requireGomeriaPermission: vi.fn().mockResolvedValue('company-1'),
  requireGomeriaAccessForCompany: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/Mantenimiento/Gomeria/shared/perimeter', () => ({
  assertServiceOrderInActiveCompany: vi.fn(),
  assertTireInCompany: vi.fn(),
  assertVehicleInActiveCompany: vi.fn(),
  assertVehicleInCompany: vi.fn(),
  getServiceOrderCompanyId: vi.fn(),
  getVehicleCompanyId: vi.fn(),
}));

import {
  assertServiceOrderInActiveCompany,
  getVehicleCompanyId,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { closeServiceOrder, closeServiceOrderForVehicle } from './service-order-lifecycle.server';

const ORDER = '11111111-1111-4111-8111-111111111111';
const VEHICLE = '22222222-2222-4222-8222-222222222222';
const COMPANY = 'company-1';

describe('closeServiceOrder (dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tire_service_orders.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cierra la orden si es de la empresa activa', async () => {
    vi.mocked(assertServiceOrderInActiveCompany).mockResolvedValue(COMPANY);

    await expect(closeServiceOrder(ORDER)).resolves.toMatchObject({ id: ORDER });
    expect(prismaMock.tire_service_orders.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER, status: 'OPEN' } })
    );
  });

  it('no cierra la orden de otra empresa', async () => {
    vi.mocked(assertServiceOrderInActiveCompany).mockRejectedValue(
      new Error('La orden de gomería no pertenece a la empresa activa')
    );

    await expect(closeServiceOrder(ORDER)).rejects.toThrow('no pertenece a la empresa activa');
    expect(prismaMock.tire_service_orders.updateMany).not.toHaveBeenCalled();
  });
});

describe('closeServiceOrderForVehicle (QR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVehicleCompanyId).mockResolvedValue(COMPANY);
    prismaMock.tire_service_orders.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cierra la orden del equipo escaneado sin mirar la empresa de sesión', async () => {
    prismaMock.tire_service_orders.findFirst.mockResolvedValue({ id: ORDER });

    await expect(closeServiceOrderForVehicle(ORDER, VEHICLE)).resolves.toMatchObject({ id: ORDER });
    expect(prismaMock.tire_service_orders.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER, vehicle_id: VEHICLE, company_id: COMPANY } })
    );
    expect(assertServiceOrderInActiveCompany).not.toHaveBeenCalled();
  });

  it('no cierra una orden que no es del equipo escaneado', async () => {
    prismaMock.tire_service_orders.findFirst.mockResolvedValue(null);

    await expect(closeServiceOrderForVehicle(ORDER, VEHICLE)).rejects.toThrow(
      'no pertenece al equipo que se está atendiendo'
    );
    expect(prismaMock.tire_service_orders.updateMany).not.toHaveBeenCalled();
  });

  it('no cierra nada si el equipo no existe o no tiene empresa', async () => {
    vi.mocked(getVehicleCompanyId).mockRejectedValue(new Error('No se encontró el equipo'));

    await expect(closeServiceOrderForVehicle(ORDER, VEHICLE)).rejects.toThrow('No se encontró el equipo');
    expect(prismaMock.tire_service_orders.findFirst).not.toHaveBeenCalled();
  });
});
