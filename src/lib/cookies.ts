import { Logger } from '@/lib/logger';
// src/lib/cookies.ts
export type FilterValue = string | string[] | { from?: Date | null; to?: Date | null } | undefined;

const logger = new Logger('lib/cookies');
const STORAGE_KEY_PREFIX = 'table-filters-';
