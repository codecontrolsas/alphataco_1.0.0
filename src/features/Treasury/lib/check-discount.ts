import { formatPesos } from './receipt-math';

/** Liquidación de un descuento de cheques (spec Tesorería etapa 3a §3.5), en centavos. */
export function discountNet(input: { nominals: bigint[]; interest: bigint; fee: bigint }): { nominal: bigint; net: bigint } {
  const nominal = input.nominals.reduce((acc, n) => acc + n, BigInt(0));
  return { nominal, net: nominal - input.interest - input.fee };
}

/** Mensaje si el neto no es positivo; null si la liquidación es válida. */
export function discountError(net: bigint): string | null {
  if (net > BigInt(0)) return null;
  const text = net < BigInt(0) ? `-${formatPesos(-net)}` : formatPesos(net);
  return `El neto da ${text}: los intereses y la comisión no pueden ser iguales o mayores que el nominal`;
}
