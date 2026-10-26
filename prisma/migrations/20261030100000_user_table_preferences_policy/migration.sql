-- Preferencias de tabla: la clave es `<credential_id>:<tabla>` (`src/shared/actions/table-preferences.ts`), pero la
-- politica `user_isolation` (rls_remaining_tables) comparaba la clave ENTERA con el usuario: ninguna fila coincidia y,
-- con el rol de la app, cada guardado violaba el WITH CHECK y cada lectura volvia vacia (las preferencias no se
-- guardaban nunca). Se compara la parte del usuario; una clave sin `:` (solo el usuario) sigue valiendo igual.
ALTER TABLE public.user_table_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON public.user_table_preferences;
CREATE POLICY user_isolation ON public.user_table_preferences
  USING (split_part(user_id, ':', 1) = public.app_current_user_id()::text)
  WITH CHECK (split_part(user_id, ':', 1) = public.app_current_user_id()::text);
