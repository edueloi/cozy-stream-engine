REVOKE EXECUTE ON FUNCTION public.list_org_calendar_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_org_calendar_status() TO authenticated;