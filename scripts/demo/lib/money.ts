/**
 * Importes de la demo. Los dominios de tesoreria y pagos trabajan en centavos (`bigint`) para
 * que los saldos cierren exacto, y los pasan como texto decimal a las columnas `Decimal`.
 */

/** Pesos a centavos (`C(12.5)` = 1250n). */
export const C = (value: number) => BigInt(Math.round(value * 100));

/** Centavos a texto decimal con dos decimales (`-1250n` = `'-12.50'`). */
export const money = (cents: bigint) => {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, '0')}`;
};

/** Centavos enteros (`number`) a texto decimal con dos decimales (`1250` = `'12.50'`). */
export const centsText = (value: number) => (value / 100).toFixed(2);
