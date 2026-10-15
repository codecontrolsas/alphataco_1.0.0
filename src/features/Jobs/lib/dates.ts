// Las fechas de negocio argentinas viven en `@/shared/lib/argentina-time`; se re-exportan acá para los
// importadores existentes (jobs, mails, Operaciones, Tesorería).
export { ARGENTINA_TIME_ZONE, argentinaDate, formatDateAr, formatLongDateAr } from '@/shared/lib/argentina-time';
