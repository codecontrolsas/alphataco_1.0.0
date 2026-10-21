import type { TicketPriority } from '@/shared/lib/taskapp/types';
import type { CategorySlug } from '../constants/categories';

export type { CategoryDef, CategorySlug } from '../constants/categories';
export type { PriorityDef, PrioritySlug } from '../constants/ticket-priority';
export type { TicketStatusPresentation as StatusDef } from '../constants/ticket-status';

export interface ReporterIdentity {
  email: string;
  name: string | null;
  /** ID estable del usuario en auth. Usado como FK en support_ticket_views. */
  userId: string;
}

export interface CreateSupportTicketInput {
  category: CategorySlug;
  title: string;
  description: string;
  priority: TicketPriority;
  attachmentKeys?: string[];
}

export interface CreateSupportCommentInput {
  ticketId: number;
  body: string;
}
