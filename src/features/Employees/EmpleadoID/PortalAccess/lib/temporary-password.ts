import 'server-only';

import { randomInt } from 'node:crypto';

/** Sin caracteres que se confunden al dictarlos o copiarlos de un papel (0/O, 1/l/I). */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

/**
 * Contraseña temporal de 12 caracteres que cumple la política (`passwordSchema`: mayúscula, minúscula y número), con
 * `crypto.randomInt` (no `Math.random`). Se muestra UNA vez a RR.HH.; en la base queda solo el hash.
 */
export function generateTemporaryPassword(): string {
  const all = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), ...Array.from({ length: 9 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
