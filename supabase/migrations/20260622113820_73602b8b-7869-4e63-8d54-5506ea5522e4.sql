-- 1) Prevent privilege escalation via profile.organization_id self-edit
CREATE OR REPLACE FUNCTION public.prevent_profile_org_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT (public.is_superadmin(auth.uid()) OR public.is_manager(auth.uid())) THEN
      NEW.organization_id := OLD.organization_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_org_change ON public.profiles;
CREATE TRIGGER profiles_prevent_org_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_org_change();

-- 2) Extend realtime.messages SELECT to all org members (not just managers)
DROP POLICY IF EXISTS realtime_messages_org_scoped_select ON realtime.messages;
CREATE POLICY realtime_messages_org_scoped_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR realtime.topic() LIKE 'org:' || public.current_org_id()::text || ':%'
  );