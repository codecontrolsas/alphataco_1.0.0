'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getOrdersPendingValidation,
  getPendingApprovalTasks,
  getReturnedOrders,
  getReturnedTasks,
  type PendingTasksData,
  type ReturnedOrdersData,
  type ReturnedTasksData,
  type ValidationOrdersData,
} from '../actions/actionsServer';

export const APPROVAL_INBOX_QUERY_KEY = ['maintenance', 'approval-inbox'] as const;

export function useValidationOrders(initialData?: ValidationOrdersData) {
  return useQuery({
    queryKey: [...APPROVAL_INBOX_QUERY_KEY, 'validation-orders'],
    queryFn: () => getOrdersPendingValidation(),
    initialData,
  });
}

export function usePendingTasks(initialData?: PendingTasksData) {
  return useQuery({
    queryKey: [...APPROVAL_INBOX_QUERY_KEY, 'pending'],
    queryFn: () => getPendingApprovalTasks(),
    initialData,
  });
}

export function useReturnedTasks(initialData?: ReturnedTasksData) {
  return useQuery({
    queryKey: [...APPROVAL_INBOX_QUERY_KEY, 'returned'],
    queryFn: () => getReturnedTasks(),
    initialData,
  });
}

/** Órdenes devueltas al taller (D-1). Solo lectura: no suma al contador del paso. */
export function useReturnedOrders(initialData?: ReturnedOrdersData) {
  return useQuery({
    queryKey: [...APPROVAL_INBOX_QUERY_KEY, 'returned-orders'],
    queryFn: () => getReturnedOrders(),
    initialData,
  });
}
