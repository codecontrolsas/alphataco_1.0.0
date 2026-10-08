import { describe, expect, it } from 'vitest';
import type { DeviationsResult, RowWithDeviations } from '../schemas/deviations';
import type { ExpirySummary } from '../schemas/documents-expiry';
import { renderDeviationsEmail } from './deviations';
import { renderDocumentsExpiryEmail } from './documents-expiry';
import { renderWarehouseBatchExpiryEmail } from './warehouse-batch-expiry';

/**
 * Las dos plantillas arman HTML concatenando strings que vienen de la base: nombres de
 * cliente, de empleado, de tipo de documento y descripciones libres que un usuario escribe.
 * Las edge functions de Deno las interpolaban crudas.
 *
 * Sin estos tests, borrar todos los `escapeHtml` dejaba la suite en verde.
 */
const HOSTILE = '<b>Mala</b> & "comilla" \'simple\'';
const ESCAPED = '&lt;b&gt;Mala&lt;/b&gt; &amp; &quot;comilla&quot; &#39;simple&#39;';

function deviationsFixture(overrides: Partial<RowWithDeviations> = {}): DeviationsResult {
  const row: RowWithDeviations = {
    row_id: 'row-1',
    customer_id: 'cust-1',
    customer_name: 'Cliente Normal',
    service_name: 'Servicio',
    item_name: 'Item',
    start_time: '08:00:00',
    end_time: '16:00:00',
    working_day: 'Completa',
    type_service: 'mensual',
    status: 'pendiente',
    description: null,
    sector_name: null,
    area_name: null,
    customer_equipment: [],
    employee_deviations: [
      {
        employee_id: 'emp-1',
        employee_name: 'Perez, Juan',
        employee_cuil: '20-11111111-1',
        role: 'chofer_dia',
        is_duplicated: false,
        is_unassigned_to_client: true,
        has_no_diagram: true,
        is_non_work_day: false,
        diagram_type_name: null,
      },
    ],
    equipment_deviations: [],
    ...overrides,
  };

  return {
    rows_with_deviations: [row],
    summary: {
      total_employee_deviations: 1,
      total_equipment_deviations: 0,
      total_duplicated_employees: 0,
      total_duplicated_equipment: 0,
      total_rows_with_deviations: 1,
    },
  };
}

function expiryFixture(overrides: Partial<ExpirySummary> = {}): ExpirySummary {
  return {
    generated_at: '2026-06-15T10:00:00',
    today: '2026-06-15',
    window_end: '2026-06-22',
    days_ahead: 7,
    detail_limit: 20,
    expiring_soon: {
      employees: {
        total: 1,
        detail: [
          {
            id: 'doc-1',
            employee_id: 'emp-1',
            document_type_id: 'dt-1',
            file_number: '001',
            employee_name: 'Perez, Juan',
            document_type_name: 'Apto Medico',
            validity: '2026-06-18',
            days_remaining: 3,
          },
        ],
      },
      equipment: { total: 0, detail: [] },
      company: { total: 0, detail: [] },
    },
    expired_counts: { employees: 0, equipment: 0, company: 0 },
    expired_doc_type_ids: { employees: [], equipment: [], company: [] },
    pending_counts: { employees: 0, equipment: 0, company: 0 },
    ...overrides,
  };
}

describe('plantillas de los jobs — escapado de HTML', () => {
  describe('desvíos del parte diario', () => {
    it('escapa el nombre del cliente', () => {
      const email = renderDeviationsEmail({
        companyName: 'Empresa',
        reportDate: '2026-06-15',
        dailyReportId: 'report-1',
        data: deviationsFixture({ customer_name: HOSTILE }),
      });

      expect(email.html).toContain(ESCAPED);
      expect(email.html).not.toContain('<b>Mala</b>');
    });

    it('escapa la descripción libre de la fila', () => {
      const email = renderDeviationsEmail({
        companyName: 'Empresa',
        reportDate: '2026-06-15',
        dailyReportId: 'report-1',
        data: deviationsFixture({ description: HOSTILE }),
      });

      expect(email.html).toContain(ESCAPED);
      expect(email.html).not.toContain('<b>Mala</b>');
    });

    it('escapa el nombre del empleado y el del servicio', () => {
      const data = deviationsFixture({ service_name: HOSTILE });
      data.rows_with_deviations[0].employee_deviations[0].employee_name = HOSTILE;

      const email = renderDeviationsEmail({
        companyName: 'Empresa',
        reportDate: '2026-06-15',
        dailyReportId: 'report-1',
        data,
      });

      expect(email.html).not.toContain('<b>Mala</b>');
      expect(email.html.match(/&lt;b&gt;Mala&lt;\/b&gt;/g)?.length).toBe(2);
    });

    it('escapa el nombre de la empresa en el encabezado y el pie', () => {
      const email = renderDeviationsEmail({
        companyName: HOSTILE,
        reportDate: '2026-06-15',
        dailyReportId: 'report-1',
        data: deviationsFixture(),
      });

      expect(email.html).not.toContain('<b>Mala</b>');
      expect(email.html).toContain(ESCAPED);
    });

    it('el nombre de la empresa va en el asunto: es la señal de a quién pertenecen los datos', () => {
      const email = renderDeviationsEmail({
        companyName: 'Empresa Uno',
        reportDate: '2026-06-15',
        dailyReportId: 'report-1',
        data: deviationsFixture(),
      });

      expect(email.subject).toContain('Empresa Uno');
      expect(email.text).toContain('Empresa Uno');
    });
  });

  describe('resumen de documentos', () => {
    it('escapa el nombre del empleado y el del tipo de documento', () => {
      const data = expiryFixture();
      data.expiring_soon.employees.detail[0].employee_name = HOSTILE;
      data.expiring_soon.employees.detail[0].document_type_name = HOSTILE;

      const email = renderDocumentsExpiryEmail({ companyName: 'Empresa', data });

      expect(email.html).not.toContain('<b>Mala</b>');
      expect(email.html.match(/&lt;b&gt;Mala&lt;\/b&gt;/g)?.length).toBe(2);
    });

    it('escapa el legajo, que es texto libre en la base', () => {
      const data = expiryFixture();
      data.expiring_soon.employees.detail[0].file_number = HOSTILE;

      const email = renderDocumentsExpiryEmail({ companyName: 'Empresa', data });

      expect(email.html).not.toContain('<b>Mala</b>');
      expect(email.html).toContain(ESCAPED);
    });

    it('escapa el nombre de la empresa', () => {
      const email = renderDocumentsExpiryEmail({ companyName: HOSTILE, data: expiryFixture() });

      expect(email.html).not.toContain('<b>Mala</b>');
      expect(email.html).toContain(ESCAPED);
    });

    it('sin novedades muestra el estado "Todo al día" y no inventa tablas', () => {
      const email = renderDocumentsExpiryEmail({
        companyName: 'Empresa',
        data: expiryFixture({
          expiring_soon: {
            employees: { total: 0, detail: [] },
            equipment: { total: 0, detail: [] },
            company: { total: 0, detail: [] },
          },
        }),
      });

      expect(email.html).toContain('Todo al d&iacute;a');
      expect(email.html).not.toContain('Legajo');
    });
  });

  it('ninguna plantilla referencia el storage de Supabase, que ya no existe', () => {
    const deviations = renderDeviationsEmail({
      companyName: 'Empresa',
      reportDate: '2026-06-15',
      dailyReportId: 'report-1',
      data: deviationsFixture(),
    });
    const expiry = renderDocumentsExpiryEmail({ companyName: 'Empresa', data: expiryFixture() });

    expect(deviations.html).not.toContain('supabase.co');
    expect(expiry.html).not.toContain('supabase.co');
  });
});

describe('renderWarehouseBatchExpiryEmail', () => {
  const item = {
    materialCode: 'DES',
    material: HOSTILE,
    unit: 'l',
    warehouse: HOSTILE,
    batch: HOSTILE,
    expiresOn: '2099-02-20',
    quantity: '5',
    status: 'EXPIRED' as const,
  };

  it('escapa los textos que vienen de la base', () => {
    const email = renderWarehouseBatchExpiryEmail({ companyName: 'Empresa', today: '2099-03-01', windowDays: 30, items: [item] });
    expect(email.html).not.toContain(HOSTILE);
    expect(email.html).toContain(ESCAPED);
  });

  it('separa vencidos de por vencer y lo dice en el texto plano', () => {
    const email = renderWarehouseBatchExpiryEmail({
      companyName: 'Empresa',
      today: '2099-03-01',
      windowDays: 30,
      items: [
        { ...item, material: 'Grasa', warehouse: 'Base', batch: 'L1' },
        { ...item, material: 'Aceite', warehouse: 'Base', batch: 'L2', status: 'EXPIRING', expiresOn: '2099-03-20' },
      ],
    });
    expect(email.text).toContain('Vencidos: 1');
    expect(email.text).toContain('Vencen en los próximos 30 días: 1');
    expect(email.html).toContain('Lotes vencidos');
    expect(email.subject).toContain('Empresa');
  });
});
