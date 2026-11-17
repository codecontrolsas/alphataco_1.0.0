-- Aviso diario de documentos por vencer en 30, 15, 7 y 1 día (ticket 842). El evento vive en el catálogo
-- (`notification-catalog.ts`); acá solo se activa para los tres roles de acceso completo, en la campanita y por mail.
INSERT INTO role_notifications (role_id, event_key, channel)
SELECT r.id, 'documents.expiry_threshold', c.channel::notification_channel
FROM roles r
CROSS JOIN (VALUES ('in_app'), ('email')) AS c(channel)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, event_key, channel) DO NOTHING;
