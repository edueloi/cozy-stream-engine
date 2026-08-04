
-- Leads: opt-out, AI pause, handoff, BANT
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_reason text,
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS qual_budget text,
  ADD COLUMN IF NOT EXISTS qual_authority text,
  ADD COLUMN IF NOT EXISTS qual_need text,
  ADD COLUMN IF NOT EXISTS qual_timing text,
  ADD COLUMN IF NOT EXISTS qual_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- App settings: anti-ban
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS whatsapp_daily_limit int NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS whatsapp_send_window_start int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS whatsapp_send_window_end int NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS whatsapp_min_interval_seconds int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS qualification_framework text NOT NULL DEFAULT 'BANT';

-- Qualification answers
CREATE TABLE IF NOT EXISTS public.qualification_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field text NOT NULL,
  value text,
  source text NOT NULL DEFAULT 'ai',
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_lead_idx ON public.qualification_answers(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualification_answers TO authenticated;
GRANT ALL ON public.qualification_answers TO service_role;
ALTER TABLE public.qualification_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa read"   ON public.qualification_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa insert" ON public.qualification_answers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qa update" ON public.qualification_answers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "qa delete" ON public.qualification_answers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Lost reasons catalog
CREATE TABLE IF NOT EXISTS public.lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  recover_after_days int NOT NULL DEFAULT 90,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lost_reasons TO authenticated;
GRANT ALL ON public.lost_reasons TO service_role;
ALTER TABLE public.lost_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lost read"  ON public.lost_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "lost admin" ON public.lost_reasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.lost_reasons (code, label, recover_after_days) VALUES
  ('preco', 'Preço', 180),
  ('funcionalidade', 'Funcionalidade ausente', 90),
  ('timing', 'Timing inadequado', 60),
  ('concorrente', 'Escolheu concorrente', 120),
  ('sem_fit', 'Sem fit de ICP', 365),
  ('sem_resposta', 'Sem resposta', 45)
ON CONFLICT (code) DO NOTHING;
