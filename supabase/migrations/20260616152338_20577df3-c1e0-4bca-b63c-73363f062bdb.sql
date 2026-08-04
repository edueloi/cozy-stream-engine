
DROP POLICY IF EXISTS "qa insert" ON public.qualification_answers;
DROP POLICY IF EXISTS "qa update" ON public.qualification_answers;
DROP POLICY IF EXISTS "qa delete" ON public.qualification_answers;

CREATE POLICY "qa insert owner" ON public.qualification_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR l.owner_id IS NULL))
  );

CREATE POLICY "qa update owner" ON public.qualification_answers
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR l.owner_id IS NULL))
  );

CREATE POLICY "qa delete admin" ON public.qualification_answers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
