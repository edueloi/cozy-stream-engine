DROP POLICY IF EXISTS realtime_messages_org_scoped_select ON realtime.messages;
CREATE POLICY realtime_messages_org_scoped_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND realtime.topic() LIKE 'org:' || public.current_org_id()::text || ':%'
    )
  );