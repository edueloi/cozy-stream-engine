
DROP POLICY IF EXISTS "settings select auth" ON public.app_settings;
DROP POLICY IF EXISTS "settings_select_auth" ON public.app_settings;
CREATE POLICY "settings_select_managers" ON public.app_settings FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "qa read" ON public.qualification_answers;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "realtime_messages_managers_select" ON realtime.messages;
CREATE POLICY "realtime_messages_managers_select" ON realtime.messages FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.bump_variant_sent(integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_variant_reply(integer, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_lead_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;
