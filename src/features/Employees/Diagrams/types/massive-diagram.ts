// ─── Mode ───────────────────────────────────────────────────────────────────

export type MassiveMode = 'diagram' | 'novelty';

// ─── Conflict Types ─────────────────────────────────────────────────────────

export interface ConflictRecord {
  employee_id: string;
  employee_name: string;
  day: number;
  month: number;
  year: number;
  date_formatted: string;
  current_diagram_type?: string;
  current_diagram_name?: string;
  current_diagram_color?: string;
  new_diagram_name?: string;
  new_diagram_color?: string;
  is_used_in_operations: boolean;
  operation_details?: string;
  can_update: boolean;
  conflict_type: 'IN_USE' | 'CAN_UPDATE';
}

export interface ConflictCheckResult {
  conflicts: ConflictRecord[];
  work_diagram_id?: string;
  active_novelty_id?: string;
  inactive_novelty_id?: string;
  diagram_type_id?: string;
  /** Registros que generaría la carga (empleados × días), con y sin conflicto. */
  total_records: number;
}

// ─── Processing Result Types ────────────────────────────────────────────────

export interface ProcessingResultRecord {
  employee_id: string;
  employee_name?: string;
  date: string;
  day: number;
  month: number;
  year: number;
  is_active: boolean;
  novelty_name?: string;
  novelty_color?: string;
}

export interface UpdatedResultRecord extends ProcessingResultRecord {
  previous_novelty_name?: string;
  previous_novelty_color?: string;
}

export interface ErrorRecord {
  employee_id: string;
  employee_name: string;
  date: string | null;
  error_type: string;
  error_message: string;
}

export interface ProcessingResult {
  success: boolean;
  summary: {
    total_employees: number;
    processed_employees: number;
    total_days: number;
    processed_days: number;
    created_records: number;
    updated_records: number;
    skipped_records: number;
    errors_count: number | null;
    processing_time_seconds: number;
    start_time: string;
    end_time: string;
  };
  data: {
    created: ProcessingResultRecord[];
    updated: UpdatedResultRecord[];
  };
  details: {
    date_range: { from: string; to: string };
    mode?: MassiveMode;
    work_diagram?: {
      id: string;
      name: string;
      active_days: number;
      inactive_days: number;
      cycle_length: number;
    };
    active_novelty?: { id: string; name: string; color: string };
    inactive_novelty?: { id: string; name: string; color: string };
    novelty?: { id: string; name: string; color: string };
    conflict_resolution: string;
    employee_ids: string[];
  };
  errors: ErrorRecord[];
}
