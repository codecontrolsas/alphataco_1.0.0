const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `true` si el texto tiene forma de UUID: un id ajeno haría fallar la consulta de Prisma. */
export const isUuid = (value: string): boolean => UUID_RE.test(value);
