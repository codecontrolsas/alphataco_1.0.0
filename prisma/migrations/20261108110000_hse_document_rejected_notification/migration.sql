-- Aviso «un empleado rechazó un documento HSE» (ticket 804): campanita y mail para los roles de acceso completo.
-- Los roles propios de la empresa lo activan a mano desde el editor de roles (regla: solo estos tres por migración).
INSERT INTO role_notifications (role_id, event_key, channel)
SELECT r.id, 'hse.document_rejected', c.channel
FROM roles r
CROSS JOIN (VALUES ('in_app'::notification_channel), ('email'::notification_channel)) AS c(channel)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, event_key, channel) DO NOTHING;
