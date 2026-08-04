
DROP POLICY IF EXISTS "leads all auth" ON public.leads;
CREATE POLICY "leads team read" ON public.leads FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "leads team write" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "leads team update" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "leads team delete" ON public.leads FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));

DROP POLICY IF EXISTS "messages all auth" ON public.messages;
CREATE POLICY "messages team read" ON public.messages FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "messages team insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "messages team update" ON public.messages FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "messages team delete" ON public.messages FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));

DROP POLICY IF EXISTS "calls all auth" ON public.calls;
CREATE POLICY "calls team read" ON public.calls FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "calls team insert" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "calls team update" ON public.calls FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "calls team delete" ON public.calls FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));

DROP POLICY IF EXISTS "activity all auth" ON public.activity_events;
CREATE POLICY "activity team read" ON public.activity_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "activity team insert" ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente','sdr','comercial']::app_role[]));
CREATE POLICY "activity team delete" ON public.activity_events FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));
