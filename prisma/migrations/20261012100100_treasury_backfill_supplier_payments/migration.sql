-- Tesoreria (etapa 1): un movimiento SUPPLIER_PAYMENT por cada medio de pago ya registrado en
-- Compras, con la misma regla que registerPayment: los cheques y e-cheqs salen en su fecha de
-- pago, las transferencias y el efectivo en la fecha de pago de la orden. Si la orden esta
-- anulada, el movimiento nace anulado con su fecha y motivo. Los pagos con neto 0 no tienen
-- medios y no generan nada. `paid_by` es nullable: el COALESCE cubre las ordenes donde falte.
INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, description, payment_order_payment_id,
                                created_by, created_at, cancelled_by, cancelled_at, cancel_reason)
SELECT po.company_id, p.treasury_account_id,
       CASE WHEN p.method IN ('CHECK', 'ECHECK') THEN p.check_due_on ELSE po.paid_on END,
       -p.amount, 'SUPPLIER_PAYMENT',
       po.number || ' — ' || s.name || CASE WHEN p.check_number IS NOT NULL THEN ' — Cheque N° ' || p.check_number ELSE '' END,
       p.id, COALESCE(po.paid_by, po.created_by), po.updated_at,
       CASE WHEN po.status = 'CANCELLED' THEN COALESCE(po.cancelled_by, po.created_by) END,
       CASE WHEN po.status = 'CANCELLED' THEN COALESCE(po.cancelled_at, po.updated_at) END,
       CASE WHEN po.status = 'CANCELLED' THEN COALESCE(po.cancel_reason, 'Orden de pago anulada') END
FROM payment_order_payments p
JOIN payment_orders po ON po.id = p.payment_order_id
JOIN suppliers s ON s.id = po.supplier_id
ON CONFLICT (payment_order_payment_id) DO NOTHING;
