import { Logger } from '@/lib/logger';
// src/lib/cookies.ts
export type FilterValue = string | string[] | { from?: Date | null; to?: Date | null } | undefined;

export type TableFilterState = {
  columnFilters: Array<{
    id: string;
    value: FilterValue;
    type?: 'faceted' | 'search' | 'date-range';
    title?: string;
  }>;
  sorting: Array<{ id: string; desc: boolean }>;
  pagination: {
    pageIndex: number;
    pageSize: number;
  };
  columnVisibility: Record<string, boolean>;
};

const logger = new Logger('lib/cookies');
const STORAGE_KEY_PREFIX = 'table-filters-';
