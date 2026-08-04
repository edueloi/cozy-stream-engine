ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS needs_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_reason text,
  ADD COLUMN IF NOT EXISTS human_flagged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_needs_human ON public.leads(organization_id, needs_human) WHERE needs_human = true;