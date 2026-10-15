import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

/** Importe decimal en string → centavos escalados (`''` cuenta como cero). */
export const cents = (value: string) => parseScaled(value === '' ? '0' : value, AMOUNT_SCALE) ?? BigInt(0);
